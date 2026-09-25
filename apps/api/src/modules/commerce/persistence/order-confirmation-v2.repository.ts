import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    ConfirmOrderCommand, ConfirmOrderResult, OrderConfirmationV2Repository,
} from "../application/order-confirmation-v2.service.js";
import { SequelizeInventoryReservationV2Repository } from "../../inventory-transfer/persistence/inventory-reservation-v2.repository.js";
import { SequelizeVoucherTransitionV2Repository } from "./voucher-transition-v2.repository.js";

type OrderRow = { id: unknown; branchId: unknown; status: string; fulfillmentStatus: string;
    totalAmount: string; discountAmount: string; fulfillmentType: string };
type ConfirmationFailure = { kind: "order_not_pending" | "payment_not_settled" | "reservation_expired" };

class RejectedConfirmation extends Error {
    constructor(readonly result: ConfirmationFailure) { super(result.kind); }
}
const reject = (kind: ConfirmationFailure["kind"]): never => { throw new RejectedConfirmation({ kind }); };

/** Internal prepaid pickup confirmation; COD requires a separate explicit policy. */
export class SequelizeOrderConfirmationV2Repository implements OrderConfirmationV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findBranch(orderId: EntityId): Promise<EntityId | null> {
        const row = (await this.persistence.sequelize.query<{ branchId: unknown }>(
            "SELECT fulfillment_branch_id AS branchId FROM orders WHERE id = ?",
            { replacements: [orderId], type: QueryTypes.SELECT },
        ))[0];
        return row ? serializeDatabaseEntityId(row.branchId) : null;
    }

    async confirm(command: ConfirmOrderCommand): Promise<ConfirmOrderResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.confirmLocked(command, transaction)));
        } catch (error) {
            if (error instanceof RejectedConfirmation) return error.result;
            throw error;
        }
    }

    private async confirmLocked(command: ConfirmOrderCommand, transaction: Transaction): Promise<ConfirmOrderResult> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<OrderRow>(
            `SELECT id, fulfillment_branch_id AS branchId, status, fulfillment_type AS fulfillmentType,
                    fulfillment_status AS fulfillmentStatus, total_amount AS totalAmount,
                    discount_amount AS discountAmount FROM orders WHERE id = ? FOR UPDATE`,
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order || serializeDatabaseEntityId(order.branchId) !== command.branchId) {
            throw new Error("Order confirmation branch changed.");
        }
        if (order.fulfillmentType === "store_pickup" && order.status === "confirmed"
            && order.fulfillmentStatus === "unfulfilled") {
            return { kind: "replayed", orderId: command.orderId };
        }
        if (order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled"
            || order.fulfillmentType !== "store_pickup") reject("order_not_pending");
        // Preserve order -> voucher -> payment -> inventory lock order even though
        // voucher transition itself runs only after the order status update.
        const redemption = (await sql.query<{ voucherId: unknown }>(
            "SELECT voucher_id AS voucherId FROM voucher_redemptions WHERE order_id = ?",
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (redemption) await sql.query("SELECT id FROM vouchers WHERE id = ? FOR UPDATE",
            { replacements: [redemption.voucherId], transaction, type: QueryTypes.SELECT });
        const payments = await sql.query<{ amount: string; status: string }>(
            "SELECT amount, status FROM payments WHERE order_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        );
        const paid = payments.reduce((sum, payment) => sum + (payment.status === "completed"
            ? BigInt(serializeMoney(payment.amount).replace(".", "")) : 0n), 0n);
        if (paid < BigInt(serializeMoney(order.totalAmount).replace(".", ""))) reject("payment_not_settled");
        const refunds = await sql.query<{ status: string }>(
            `SELECT r.status FROM refunds r JOIN payments p ON p.id = r.payment_id
             WHERE p.order_id = ? ORDER BY r.id ASC FOR UPDATE`,
            { replacements: [command.orderId], transaction, type: QueryTypes.SELECT },
        );
        if (refunds.some((refund) => !["failed", "cancelled"].includes(refund.status))) {
            reject("payment_not_settled");
        }
        await sql.query(
            "UPDATE orders SET status = 'confirmed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [command.orderId], transaction },
        );
        const voucher = await new SequelizeVoucherTransitionV2Repository(this.persistence, transaction)
            .transition({ orderId: command.orderId, action: "redeem" });
        if (voucher.kind === "redemption_not_found" && serializeMoney(order.discountAmount) !== "0.0000") {
            throw new Error("Discounted order has no voucher redemption.");
        }
        if (!(voucher.kind === "redeemed" || voucher.kind === "replayed" || voucher.kind === "redemption_not_found")) {
            throw new Error(`Voucher confirmation failed: ${voucher.kind}`);
        }
        const reservations = await sql.query<{ id: unknown; itemId: unknown }>(
            `SELECT r.id, r.order_item_id AS itemId FROM inventory_reservations r
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
            || expected.some((item) => !itemIds.has(serializeDatabaseEntityId(item.id)))) {
            throw new Error("Order confirmation reservations are incomplete.");
        }
        const inventory = new SequelizeInventoryReservationV2Repository(this.persistence, transaction);
        for (const reservation of reservations) {
            const result = await inventory.confirmOrderReservation(serializeDatabaseEntityId(reservation.id));
            if (result.kind === "reservation_expired") reject("reservation_expired");
            if (result.kind !== "confirmed") throw new Error(`Reservation confirmation failed: ${result.kind}`);
        }
        await sql.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status,
                from_fulfillment_status, to_fulfillment_status, changed_by_account_id, changed_at)
             VALUES (?, 'pending', 'confirmed', 'unfulfilled', 'unfulfilled', ?, UTC_TIMESTAMP(3))`,
            { replacements: [command.orderId, command.actorAccountId], transaction },
        );
        await sql.query(
            `INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id,
                payload, occurred_at, created_at, updated_at)
             VALUES (?, 'commerce.order.confirmed', 'order', ?, ?, UTC_TIMESTAMP(3),
                UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [randomUUID(), command.orderId,
                JSON.stringify({ orderId: command.orderId, branchId: command.branchId })], transaction },
        );
        return { kind: "confirmed", orderId: command.orderId };
    }
}
