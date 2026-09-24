import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    InventoryReservationV2Repository, ReserveOrderItemInput, ReserveOrderItemResult,
} from "../application/inventory-reservation-v2.service.js";

type OrderItemRow = { orderId: unknown; variantId: unknown; quantity: unknown };
type OrderRow = { branchId: unknown; status: string; fulfillmentStatus: string };
type InventoryRow = { id: unknown; stock: unknown };
type HoldRow = { id: unknown; inventoryId: unknown; orderItemId: unknown; quantity: unknown; status: string; expiresAtEpoch: unknown };

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
    constructor(private readonly persistence: V2Persistence) {}

    async reserveOrderItem(input: ReserveOrderItemInput): Promise<ReserveOrderItemResult> {
        try {
            return await this.persistence.inTransaction((transaction) => this.reserveLocked(input, transaction));
        } catch (error) {
            const code = (error as { parent?: { code?: string } })?.parent?.code;
            if (code === "ER_DUP_ENTRY") return { kind: "idempotency_conflict" };
            throw error;
        }
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
            "SELECT quantity FROM inventory_reservations WHERE inventory_id = ? AND status = 'active' FOR UPDATE",
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
            "INSERT INTO inventory_reservations (inventory_id, order_item_id, quantity, status, expires_at, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, 'active', FROM_UNIXTIME(?), ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [inventoryId, input.orderItemId, quantity, input.expiresAt.getTime() / 1000, input.idempotencyKey], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "reserved", reservationId: serializeDatabaseEntityId(id), quantity };
    }
}
