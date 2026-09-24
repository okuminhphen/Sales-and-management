import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { InventoryReservationExpiryV2Repository } from "../application/inventory-reservation-expiry-v2.worker.js";

type ReservationSource = { orderId: unknown; orderItemId: unknown; inventoryId: unknown };
type OrderRow = { branchId: unknown; status: string; fulfillmentStatus: string };
type ItemRow = { variantId: unknown; quantity: unknown };
type InventoryRow = { branchId: unknown; variantId: unknown };
type HoldRow = { orderItemId: unknown; inventoryId: unknown; quantity: unknown; status: string;
    confirmedAt: Date | null; expired: number };

const positiveInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/** Scans without row locks, then rechecks under order -> payment -> item -> inventory -> hold locks. */
export class SequelizeInventoryReservationExpiryV2Repository implements InventoryReservationExpiryV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findNextCandidate(afterId: EntityId | null): Promise<EntityId | null> {
        const rows = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT id FROM inventory_reservations
             WHERE id > ? AND order_item_id IS NOT NULL AND status = 'active'
               AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP(3)
             ORDER BY id ASC LIMIT 1`,
            { replacements: [afterId ?? "0"], type: QueryTypes.SELECT },
        );
        return rows[0] ? serializeDatabaseEntityId(rows[0].id) : null;
    }

    async expireCandidate(reservationId: EntityId): Promise<{ kind: "expired" | "skipped" }> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) => this.expireLocked(reservationId, transaction)));
    }

    private async expireLocked(reservationId: EntityId, transaction: Transaction): Promise<{ kind: "expired" | "skipped" }> {
        // Discover immutable FKs before locking so callbacks and checkout use the same order.
        const sources = await this.persistence.sequelize.query<ReservationSource>(
            `SELECT oi.order_id AS orderId, r.order_item_id AS orderItemId, r.inventory_id AS inventoryId
             FROM inventory_reservations r JOIN order_items oi ON oi.id = r.order_item_id WHERE r.id = ?`,
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const source = sources[0];
        if (!source) return { kind: "skipped" };
        const orderId = serializeDatabaseEntityId(source.orderId);
        const orderItemId = serializeDatabaseEntityId(source.orderItemId);
        const inventoryId = serializeDatabaseEntityId(source.inventoryId);
        const orders = await this.persistence.sequelize.query<OrderRow>(
            "SELECT fulfillment_branch_id AS branchId, status, fulfillment_status AS fulfillmentStatus FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        const order = orders[0];
        if (!order) throw new Error("Reservation order disappeared.");
        if (order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled") return { kind: "skipped" };

        const payments = await this.persistence.sequelize.query<{ status: string }>(
            "SELECT status FROM payments WHERE order_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        // pending and processing are not proof of failure; completed may be a partial payment.
        if (payments.some((payment) => payment.status !== "failed" && payment.status !== "cancelled")) {
            return { kind: "skipped" };
        }
        const items = await this.persistence.sequelize.query<ItemRow>(
            "SELECT product_variant_id AS variantId, quantity FROM order_items WHERE id = ? AND order_id = ? FOR UPDATE",
            { replacements: [orderItemId, orderId], transaction, type: QueryTypes.SELECT },
        );
        const inventories = await this.persistence.sequelize.query<InventoryRow>(
            "SELECT branch_id AS branchId, product_variant_id AS variantId FROM inventories WHERE id = ? FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const holds = await this.persistence.sequelize.query<HoldRow>(
            `SELECT order_item_id AS orderItemId, inventory_id AS inventoryId, quantity, status,
                    confirmed_at AS confirmedAt, (expires_at <= CURRENT_TIMESTAMP(3)) AS expired
             FROM inventory_reservations WHERE id = ? FOR UPDATE`,
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const item = items[0];
        const inventory = inventories[0];
        const hold = holds[0];
        if (!item || !inventory || !hold || item.variantId === null || hold.orderItemId === null
            || serializeDatabaseEntityId(order.branchId) !== serializeDatabaseEntityId(inventory.branchId)
            || serializeDatabaseEntityId(item.variantId) !== serializeDatabaseEntityId(inventory.variantId)
            || serializeDatabaseEntityId(hold.orderItemId) !== orderItemId
            || serializeDatabaseEntityId(hold.inventoryId) !== inventoryId
            || !positiveInt(item.quantity) || positiveInt(item.quantity) !== positiveInt(hold.quantity)) {
            throw new Error("Reservation source does not match order/inventory.");
        }
        if (hold.status !== "active" || hold.confirmedAt !== null || Number(hold.expired) !== 1) {
            return { kind: "skipped" };
        }
        await this.persistence.sequelize.query(
            "UPDATE inventory_reservations SET status = 'expired', released_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [reservationId], transaction },
        );
        return { kind: "expired" };
    }
}
