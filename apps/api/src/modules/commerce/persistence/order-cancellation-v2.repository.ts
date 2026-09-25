import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CancelOrderCommand, CancelOrderResult, OrderCancellationV2Repository,
} from "../application/order-cancellation-v2.service.js";
import { SequelizeInventoryReservationV2Repository } from "../../inventory-transfer/persistence/inventory-reservation-v2.repository.js";
import { SequelizeVoucherTransitionV2Repository } from "./voucher-transition-v2.repository.js";

type OrderRow = { branchId: unknown; status: string; fulfillmentStatus: string;
    fulfillmentType: string; discountAmount: string };
type CancellationFailure = { kind: "order_not_cancellable" | "payment_unresolved" };
class RejectedCancellation extends Error {
    constructor(readonly result: CancellationFailure) { super(result.kind); }
}
const reject = (kind: CancellationFailure["kind"]): never => { throw new RejectedCancellation({ kind }); };

/** Narrow initial policy: unpaid pending pickup only; never cancels a payment attempt. */
export class SequelizeOrderCancellationV2Repository implements OrderCancellationV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findBranch(orderId: EntityId): Promise<EntityId | null> {
        const row = (await this.persistence.sequelize.query<{ branchId: unknown }>(
            "SELECT fulfillment_branch_id AS branchId FROM orders WHERE id = ?",
            { replacements: [orderId], type: QueryTypes.SELECT },
        ))[0];
        return row ? serializeDatabaseEntityId(row.branchId) : null;
    }

    async cancel(command: CancelOrderCommand): Promise<CancelOrderResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.cancelLocked(command, transaction)));
        } catch (error) {
            if (error instanceof RejectedCancellation) return error.result;
            throw error;
        }
    }

    private async cancelLocked(command: CancelOrderCommand, transaction: Transaction): Promise<CancelOrderResult> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<OrderRow>(
            `SELECT fulfillment_branch_id AS branchId, status, fulfillment_status AS fulfillmentStatus,
                    fulfillment_type AS fulfillmentType, discount_amount AS discountAmount
             FROM orders WHERE id = ? FOR UPDATE`,
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order || serializeDatabaseEntityId(order.branchId) !== command.branchId) {
            throw new Error("Order cancellation branch changed.");
        }
        if (order.fulfillmentType === "store_pickup" && order.status === "cancelled"
            && order.fulfillmentStatus === "cancelled") {
            return { kind: "replayed", orderId: command.orderId };
        }
        if (order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled"
            || order.fulfillmentType !== "store_pickup") reject("order_not_cancellable");
        // Immutable redemption FK lookup, then order -> voucher -> payment -> inventory.
        const redemption = (await sql.query<{ voucherId: unknown }>(
            "SELECT voucher_id AS voucherId FROM voucher_redemptions WHERE order_id = ?",
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (redemption) await sql.query("SELECT id FROM vouchers WHERE id = ? FOR UPDATE",
            { replacements: [redemption.voucherId], transaction, type: QueryTypes.SELECT });
        const payments = await sql.query<{ status: string }>(
            "SELECT status FROM payments WHERE order_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        );
        if (payments.some((payment) => !["failed", "cancelled"].includes(payment.status))) reject("payment_unresolved");
        const refunds = await sql.query<{ status: string }>(
            `SELECT r.status FROM refunds r JOIN payments p ON p.id = r.payment_id
             WHERE p.order_id = ? ORDER BY r.id ASC FOR UPDATE`,
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        );
        if (refunds.some((refund) => !["failed", "cancelled"].includes(refund.status))) reject("payment_unresolved");
        const reservations = await sql.query<{ id: unknown; itemId: unknown; status: string }>(
            `SELECT r.id, r.order_item_id AS itemId, r.status FROM inventory_reservations r
             JOIN order_items oi ON oi.id = r.order_item_id
             WHERE oi.order_id = ? ORDER BY r.inventory_id ASC, r.id ASC`,
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        );
        const expected = await sql.query<{ id: unknown }>(
            "SELECT id FROM order_items WHERE order_id = ? ORDER BY id ASC",
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        );
        const itemIds = new Set(reservations.map((reservation) => serializeDatabaseEntityId(reservation.itemId)));
        if (expected.length !== reservations.length || reservations.length === 0
            || expected.some((item) => !itemIds.has(serializeDatabaseEntityId(item.id)))
            || reservations.some((reservation) => !["active", "expired"].includes(reservation.status))) {
            throw new Error("Order cancellation reservations are incomplete or already consumed.");
        }
        await sql.query(
            `UPDATE orders SET status = 'cancelled', fulfillment_status = 'cancelled',
                cancelled_at = UTC_TIMESTAMP(3), cancelled_by_account_id = ?,
                cancellation_reason = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [command.actorAccountId, command.reason, command.orderId], transaction },
        );
        const voucher = await new SequelizeVoucherTransitionV2Repository(this.persistence, transaction)
            .transition({ orderId: command.orderId, action: "release" });
        if (voucher.kind === "redemption_not_found" && serializeMoney(order.discountAmount) !== "0.0000") {
            throw new Error("Discounted order has no voucher redemption.");
        }
        if (!(voucher.kind === "released" || voucher.kind === "replayed" || voucher.kind === "redemption_not_found")) {
            throw new Error(`Voucher cancellation failed: ${voucher.kind}`);
        }
        const inventory = new SequelizeInventoryReservationV2Repository(this.persistence, transaction);
        for (const reservation of reservations) {
            if (reservation.status === "expired") continue;
            const result = await inventory.releaseCancelledOrderReservation(serializeDatabaseEntityId(reservation.id));
            if (result.kind === "payment_unresolved") reject("payment_unresolved");
            if (result.kind !== "released") throw new Error(`Reservation cancellation failed: ${result.kind}`);
        }
        await sql.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status,
                from_fulfillment_status, to_fulfillment_status, changed_by_account_id, note, changed_at)
             VALUES (?, 'pending', 'cancelled', 'unfulfilled', 'cancelled', ?, ?, UTC_TIMESTAMP(3))`,
            { replacements: [command.orderId, command.actorAccountId, command.reason], transaction },
        );
        await sql.query(
            `INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id,
                payload, occurred_at, created_at, updated_at)
             VALUES (?, 'commerce.order.cancelled', 'order', ?, ?, UTC_TIMESTAMP(3),
                UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [randomUUID(), command.orderId,
                JSON.stringify({ orderId: command.orderId, branchId: command.branchId })], transaction },
        );
        return { kind: "cancelled", orderId: command.orderId };
    }
}
