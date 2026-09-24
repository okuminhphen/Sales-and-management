import { QueryTypes, type Transaction } from "sequelize";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    InventoryReservationV2Repository, ReserveOrderItemInput, ReserveOrderItemResult,
} from "../application/inventory-reservation-v2.service.js";
import type { ReservationConfirmationOutcome } from "../application/inventory-reservation-confirmation-v2.service.js";
import type { ReservationReleaseOutcome } from "../application/inventory-reservation-release-v2.service.js";
import type { ReservationConsumeOutcome } from "../application/inventory-reservation-consume-v2.service.js";

type OrderItemRow = { orderId: unknown; variantId: unknown; quantity: unknown };
type OrderRow = { branchId: unknown; status: string; fulfillmentStatus: string };
type InventoryRow = { id: unknown; stock: unknown };
type HoldRow = { id: unknown; inventoryId: unknown; orderItemId: unknown; quantity: unknown; status: string; expiresAtEpoch: unknown };
type ReservationIdentity = { orderId: EntityId; inventoryId: EntityId; orderItemId: EntityId };

const positiveInt = (value: unknown): number | null => {
    const quantity = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
};
const nonnegativeInt = (value: unknown): number | null => {
    const quantity = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
};

/** Checkout lock order: order -> order item -> inventory -> reservation. */
export class SequelizeInventoryReservationV2Repository implements InventoryReservationV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    private async findOrderReservationIdentity(reservationId: string, transaction: Transaction): Promise<ReservationIdentity | null> {
        // Source FKs cannot be changed by these flows. Discover them before
        // locking so every transition starts with the order row.
        const rows = await this.persistence.sequelize.query<{ orderId: unknown; inventoryId: unknown; orderItemId: unknown }>(
            `SELECT oi.order_id AS orderId, r.inventory_id AS inventoryId, r.order_item_id AS orderItemId
             FROM inventory_reservations r JOIN order_items oi ON oi.id = r.order_item_id WHERE r.id = ?`,
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const row = rows[0];
        return row ? { orderId: serializeDatabaseEntityId(row.orderId), inventoryId: serializeDatabaseEntityId(row.inventoryId),
            orderItemId: serializeDatabaseEntityId(row.orderItemId) } : null;
    }

    private assertOrderReservationSource(
        order: { branchId: unknown }, item: { variantId: unknown; quantity: unknown } | undefined,
        inventory: { branchId: unknown; variantId: unknown } | undefined,
        hold: { orderItemId: unknown; quantity: unknown } | undefined, orderItemId: EntityId,
    ): void {
        if (!item || !inventory || !hold || item.variantId === null || hold.orderItemId === null
            || serializeDatabaseEntityId(hold.orderItemId) !== orderItemId
            || serializeDatabaseEntityId(order.branchId) !== serializeDatabaseEntityId(inventory.branchId)
            || serializeDatabaseEntityId(item.variantId) !== serializeDatabaseEntityId(inventory.variantId)
            || !positiveInt(item.quantity) || positiveInt(item.quantity) !== positiveInt(hold.quantity)) {
            throw new Error("Reservation source does not match order/inventory.");
        }
    }

    async reserveOrderItem(input: ReserveOrderItemInput): Promise<ReserveOrderItemResult> {
        try {
            // Checkout injects its existing transaction: creating the order and
            // its hold must commit or roll back together. Standalone callers
            // get a private transaction. Retry the whole checkout, not this
            // sub-operation, when a scoped transaction hits a deadlock.
            return this.transaction
                ? await this.reserveLocked(input, this.transaction)
                : await retryV2Transaction(() => this.persistence.inTransaction((transaction) => this.reserveLocked(input, transaction)));
        } catch (error) {
            const code = (error as { parent?: { code?: string } })?.parent?.code;
            if (code === "ER_DUP_ENTRY") return { kind: "idempotency_conflict" };
            throw error;
        }
    }

    /** Called in the same transaction that confirms payment/COD order state. */
    async confirmOrderReservation(reservationId: string): Promise<ReservationConfirmationOutcome> {
        const work = (transaction: Transaction) => this.confirmLocked(reservationId, transaction);
        return this.transaction ? work(this.transaction) : this.persistence.inTransaction(work);
    }

    private async confirmLocked(reservationId: string, transaction: Transaction): Promise<ReservationConfirmationOutcome> {
        const identity = await this.findOrderReservationIdentity(reservationId, transaction);
        if (!identity) return { kind: "reservation_not_found" };
        const { orderId, inventoryId, orderItemId } = identity;
        const orders = await this.persistence.sequelize.query<{ branchId: unknown; status: string }>(
            "SELECT fulfillment_branch_id AS branchId, status FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        const items = await this.persistence.sequelize.query<{ variantId: unknown; quantity: unknown }>(
            "SELECT product_variant_id AS variantId, quantity FROM order_items WHERE id = ? AND order_id = ? FOR UPDATE",
            { replacements: [orderItemId, orderId], transaction, type: QueryTypes.SELECT },
        );
        const inventories = await this.persistence.sequelize.query<{ branchId: unknown; variantId: unknown }>(
            "SELECT branch_id AS branchId, product_variant_id AS variantId FROM inventories WHERE id = ? FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const holds = await this.persistence.sequelize.query<{ status: string; orderItemId: unknown; quantity: unknown; confirmedAt: Date | null; expiresAt: Date | null; expired: number }>(
            "SELECT status, order_item_id AS orderItemId, quantity, confirmed_at AS confirmedAt, expires_at AS expiresAt, (expires_at <= CURRENT_TIMESTAMP(3)) AS expired FROM inventory_reservations WHERE id = ? FOR UPDATE",
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const order = orders[0];
        const item = items[0];
        const inventory = inventories[0];
        const hold = holds[0];
        if (!order) throw new Error("Reservation order disappeared.");
        this.assertOrderReservationSource(order, item, inventory, hold, orderItemId);
        if (order.status !== "confirmed") return { kind: "order_not_confirmed" };
        if (hold.status !== "active") return { kind: "reservation_finalized" };
        if (hold.confirmedAt !== null && hold.expiresAt === null) return { kind: "replayed" };
        if (hold.expiresAt === null || Number(hold.expired) === 1) return { kind: "reservation_expired" };
        await this.persistence.sequelize.query(
            "UPDATE inventory_reservations SET confirmed_at = CURRENT_TIMESTAMP(3), expires_at = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [reservationId], transaction },
        );
        return { kind: "confirmed" };
    }

    /** Release only after cancellation, while no payment attempt can still succeed. */
    async releaseCancelledOrderReservation(reservationId: string): Promise<ReservationReleaseOutcome> {
        const work = (transaction: Transaction) => this.releaseCancelledLocked(reservationId, transaction);
        return this.transaction ? work(this.transaction) : this.persistence.inTransaction(work);
    }

    private async releaseCancelledLocked(reservationId: string, transaction: Transaction): Promise<ReservationReleaseOutcome> {
        const identity = await this.findOrderReservationIdentity(reservationId, transaction);
        if (!identity) return { kind: "reservation_not_found" };
        const { orderId, inventoryId, orderItemId } = identity;
        const orders = await this.persistence.sequelize.query<{ branchId: unknown; status: string; fulfillmentStatus: string }>(
            "SELECT fulfillment_branch_id AS branchId, status, fulfillment_status AS fulfillmentStatus FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        const order = orders[0];
        if (!order) throw new Error("Reservation order disappeared.");
        if (order.status !== "cancelled" || order.fulfillmentStatus !== "cancelled") return { kind: "order_not_cancelled" };
        const payments = await this.persistence.sequelize.query<{ status: string }>(
            "SELECT status FROM payments WHERE order_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        if (payments.some((payment) => !["failed", "cancelled"].includes(payment.status))) {
            return { kind: "payment_unresolved" };
        }
        const items = await this.persistence.sequelize.query<{ variantId: unknown; quantity: unknown }>(
            "SELECT product_variant_id AS variantId, quantity FROM order_items WHERE id = ? AND order_id = ? FOR UPDATE",
            { replacements: [orderItemId, orderId], transaction, type: QueryTypes.SELECT },
        );
        const inventories = await this.persistence.sequelize.query<{ branchId: unknown; variantId: unknown }>(
            "SELECT branch_id AS branchId, product_variant_id AS variantId FROM inventories WHERE id = ? FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const holds = await this.persistence.sequelize.query<{ status: string; orderItemId: unknown; quantity: unknown }>(
            "SELECT status, order_item_id AS orderItemId, quantity FROM inventory_reservations WHERE id = ? FOR UPDATE",
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const item = items[0];
        const inventory = inventories[0];
        const hold = holds[0];
        this.assertOrderReservationSource(order, item, inventory, hold, orderItemId);
        if (hold.status === "released") return { kind: "replayed" };
        if (hold.status !== "active") return { kind: "reservation_finalized" };
        await this.persistence.sequelize.query(
            "UPDATE inventory_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [reservationId], transaction },
        );
        return { kind: "released" };
    }

    /** Handover primitive: caller owns the order/payment/fulfillment transaction. */
    async consumeOrderReservation(reservationId: string, operationKey: string, actorAccountId: string | null = null): Promise<ReservationConsumeOutcome> {
        if (!/^[A-Za-z0-9._:-]{1,191}$/.test(operationKey)) throw new TypeError("Invalid inventory operation key.");
        const work = (transaction: Transaction) => this.consumeLocked(reservationId, operationKey, actorAccountId, transaction);
        try {
            return this.transaction ? await work(this.transaction) : await this.persistence.inTransaction(work);
        } catch (error) {
            const code = (error as { parent?: { code?: string } })?.parent?.code;
            if (code === "ER_DUP_ENTRY") return { kind: "idempotency_conflict" };
            throw error;
        }
    }

    private async consumeLocked(reservationId: string, operationKey: string, actorAccountId: string | null,
        transaction: Transaction): Promise<ReservationConsumeOutcome> {
        const identity = await this.findOrderReservationIdentity(reservationId, transaction);
        if (!identity) return { kind: "reservation_not_found" };
        const { orderId, inventoryId, orderItemId } = identity;
        const orders = await this.persistence.sequelize.query<OrderRow>(
            "SELECT fulfillment_branch_id AS branchId, status, fulfillment_status AS fulfillmentStatus FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        const order = orders[0];
        if (!order) throw new Error("Reservation order disappeared.");
        if (!["confirmed", "completed"].includes(order.status)
            || !["shipping", "fulfilled"].includes(order.fulfillmentStatus)) return { kind: "order_not_ready" };
        const items = await this.persistence.sequelize.query<{ variantId: unknown; quantity: unknown }>(
            "SELECT product_variant_id AS variantId, quantity FROM order_items WHERE id = ? AND order_id = ? FOR UPDATE",
            { replacements: [orderItemId, orderId], transaction, type: QueryTypes.SELECT },
        );
        const inventories = await this.persistence.sequelize.query<{ branchId: unknown; variantId: unknown; stock: unknown }>(
            "SELECT branch_id AS branchId, product_variant_id AS variantId, stock FROM inventories WHERE id = ? FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const activeHolds = await this.persistence.sequelize.query<{ quantity: unknown }>(
            "SELECT quantity FROM inventory_reservations WHERE inventory_id = ? AND status = 'active' ORDER BY id ASC FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const holds = await this.persistence.sequelize.query<{ status: string; orderItemId: unknown; quantity: unknown; confirmedAt: Date | null; expiresAt: Date | null }>(
            "SELECT status, order_item_id AS orderItemId, quantity, confirmed_at AS confirmedAt, expires_at AS expiresAt FROM inventory_reservations WHERE id = ? FOR UPDATE",
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const item = items[0];
        const inventory = inventories[0];
        const hold = holds[0];
        this.assertOrderReservationSource(order, item, inventory, hold, orderItemId);
        const itemQuantity = positiveInt(hold.quantity)!;
        const movements = await this.persistence.sequelize.query<{
            orderItemId: unknown; branchId: unknown; variantId: unknown; quantityDelta: unknown; balanceAfter: unknown;
        }>(
            "SELECT order_item_id AS orderItemId, branch_id AS branchId, product_variant_id AS variantId, quantity_delta AS quantityDelta, balance_after AS balanceAfter FROM inventory_movements WHERE idempotency_key = ? FOR UPDATE",
            { replacements: [operationKey], transaction, type: QueryTypes.SELECT },
        );
        if (movements[0]) {
            const movement = movements[0];
            const same = movement.orderItemId !== null && serializeDatabaseEntityId(movement.orderItemId) === orderItemId
                && serializeDatabaseEntityId(movement.branchId) === serializeDatabaseEntityId(order.branchId)
                && serializeDatabaseEntityId(movement.variantId) === serializeDatabaseEntityId(item.variantId)
                && Number(movement.quantityDelta) === -itemQuantity;
            if (!same || hold.status !== "consumed") return { kind: "idempotency_conflict" };
            const previousBalance = nonnegativeInt(movement.balanceAfter);
            if (previousBalance === null) throw new Error("Invalid movement balance in database.");
            return { kind: "replayed", balanceAfter: previousBalance };
        }
        if (hold.status !== "active") return { kind: "reservation_finalized" };
        if (hold.confirmedAt === null || hold.expiresAt !== null) return { kind: "hold_not_confirmed" };
        const stock = nonnegativeInt(inventory.stock);
        if (stock === null) throw new Error("Invalid stock in database.");
        const reserved = activeHolds.reduce((sum, row) => {
            const held = positiveInt(row.quantity);
            if (!held || !Number.isSafeInteger(sum + held)) throw new Error("Invalid active hold quantity.");
            return sum + held;
        }, 0);
        if (reserved > stock || itemQuantity > stock) throw new Error("Inventory invariant violated before handover.");
        const balanceAfter = stock - itemQuantity;
        if (balanceAfter < reserved - itemQuantity) throw new Error("Inventory invariant violated after handover.");
        await this.persistence.sequelize.query(
            "UPDATE inventories SET stock = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [balanceAfter, inventoryId], transaction },
        );
        await this.persistence.sequelize.query(
            "UPDATE inventory_reservations SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [reservationId], transaction },
        );
        await this.persistence.sequelize.query(
            "INSERT INTO inventory_movements (branch_id, product_variant_id, quantity_delta, balance_after, order_item_id, reason, reference_type, reference_id, idempotency_key, created_by_account_id, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, 'order_handover', 'order', ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
            { replacements: [order.branchId, item.variantId, -itemQuantity, balanceAfter, orderItemId,
                orderId, operationKey, actorAccountId], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "consumed", balanceAfter };
    }

    private async reserveLocked(input: ReserveOrderItemInput, transaction: Transaction): Promise<ReserveOrderItemResult> {
        // order_id is immutable; discover it before taking locks so order is always first.
        const identity = await this.persistence.sequelize.query<{ orderId: unknown }>(
            "SELECT order_id AS orderId FROM order_items WHERE id = ?",
            { replacements: [input.orderItemId], transaction, type: QueryTypes.SELECT },
        );
        if (!identity[0]) return { kind: "order_item_not_reservable" };
        const orderId = serializeDatabaseEntityId(identity[0].orderId);
        const orders = await this.persistence.sequelize.query<OrderRow>(
            "SELECT fulfillment_branch_id AS branchId, status, fulfillment_status AS fulfillmentStatus FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        const items = await this.persistence.sequelize.query<OrderItemRow>(
            "SELECT order_id AS orderId, product_variant_id AS variantId, quantity FROM order_items WHERE id = ? FOR UPDATE",
            { replacements: [input.orderItemId], transaction, type: QueryTypes.SELECT },
        );
        const order = orders[0];
        const item = items[0];
        if (!order || !item || serializeDatabaseEntityId(item.orderId) !== orderId
            || order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled"
            || item.variantId === null) return { kind: "order_item_not_reservable" };
        const branchId = serializeDatabaseEntityId(order.branchId);
        const variantId = serializeDatabaseEntityId(item.variantId);
        const quantity = positiveInt(item.quantity);
        if (!quantity) throw new Error("Invalid order item quantity in database.");

        const inventories = await this.persistence.sequelize.query<InventoryRow>(
            "SELECT id, stock FROM inventories WHERE branch_id = ? AND product_variant_id = ? FOR UPDATE",
            { replacements: [branchId, variantId], transaction, type: QueryTypes.SELECT },
        );
        const inventory = inventories[0];
        if (!inventory) return { kind: "insufficient_stock" };
        const inventoryId = serializeDatabaseEntityId(inventory.id);
        const stock = nonnegativeInt(inventory.stock);
        if (stock === null) throw new Error("Invalid stock in database.");

        const existing = await this.persistence.sequelize.query<HoldRow>(
            "SELECT id, inventory_id AS inventoryId, order_item_id AS orderItemId, quantity, status, UNIX_TIMESTAMP(expires_at) AS expiresAtEpoch FROM inventory_reservations WHERE idempotency_key = ? FOR UPDATE",
            { replacements: [input.idempotencyKey], transaction, type: QueryTypes.SELECT },
        );
        if (existing[0]) {
            const hold = existing[0];
            const same = serializeDatabaseEntityId(hold.inventoryId) === inventoryId
                && hold.orderItemId !== null && serializeDatabaseEntityId(hold.orderItemId) === input.orderItemId
                && positiveInt(hold.quantity) === quantity
                && nonnegativeInt(hold.expiresAtEpoch) === input.expiresAt.getTime() / 1000;
            return same && hold.status === "active"
                ? { kind: "replayed", reservationId: serializeDatabaseEntityId(hold.id), quantity }
                : { kind: "idempotency_conflict" };
        }

        const previous = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM inventory_reservations WHERE order_item_id = ? AND status = 'active' LIMIT 1 FOR UPDATE",
            { replacements: [input.orderItemId], transaction, type: QueryTypes.SELECT },
        );
        if (previous.length > 0) return { kind: "already_reserved" };
        // A locking read is essential here: a plain aggregate can see the old
        // REPEATABLE READ snapshot created before this transaction acquired i.
        const activeHolds = await this.persistence.sequelize.query<{ quantity: unknown }>(
            "SELECT quantity FROM inventory_reservations WHERE inventory_id = ? AND status = 'active' ORDER BY id ASC FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const reserved = activeHolds.reduce((sum, hold) => {
            const quantityInHold = positiveInt(hold.quantity);
            if (!quantityInHold || !Number.isSafeInteger(sum + quantityInHold)) throw new Error("Invalid active hold quantity.");
            return sum + quantityInHold;
        }, 0);
        if (reserved > stock) throw new Error("Invalid active reservation total in database.");
        if (quantity > stock - reserved) return { kind: "insufficient_stock" };
        const [id] = await this.persistence.sequelize.query(
            "INSERT INTO inventory_reservations (inventory_id, order_item_id, quantity, status, expires_at, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, 'active', FROM_UNIXTIME(?), ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
            { replacements: [inventoryId, input.orderItemId, quantity, input.expiresAt.getTime() / 1000, input.idempotencyKey], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "reserved", reservationId: serializeDatabaseEntityId(id), quantity };
    }
}
