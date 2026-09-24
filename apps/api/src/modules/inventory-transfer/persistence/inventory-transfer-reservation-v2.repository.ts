import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    InventoryTransferReservationV2Repository, ReserveTransferItemInput, ReserveTransferItemOutcome,
} from "../application/inventory-transfer-reservation-v2.service.js";

type IdentityRow = { receiptId: unknown; requestId: unknown; variantId: unknown };
type ReceiptRow = { requestId: unknown; fromBranchId: unknown; toBranchId: unknown; status: string };
type RequestRow = { fromBranchId: unknown; toBranchId: unknown; status: string };
type ItemRow = { variantId: unknown; quantity: unknown };
type InventoryRow = { id: unknown; branchId: unknown; variantId: unknown; stock: unknown };
type HoldRow = { id: unknown; transferItemId: unknown; inventoryId: unknown; quantity: unknown; status: string; confirmedAt: Date | null; expiresAt: Date | null };

const positiveInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const nonnegativeInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export class SequelizeInventoryTransferReservationV2Repository implements InventoryTransferReservationV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    async reserveTransferItem(input: ReserveTransferItemInput): Promise<ReserveTransferItemOutcome> {
        try {
            const work = (transaction: Transaction) => this.reserveLocked(input, transaction);
            return this.transaction ? await work(this.transaction) : await this.persistence.inTransaction(work);
        } catch (error) {
            if ((error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                return { kind: "idempotency_conflict" };
            }
            throw error;
        }
    }

    private async reserveLocked(input: ReserveTransferItemInput, transaction: Transaction): Promise<ReserveTransferItemOutcome> {
        // Discover immutable FK identities first. Every approval takes request -> receipt
        // -> item -> inventory -> reservation locks in this order.
        const identities = await this.persistence.sequelize.query<IdentityRow>(
            `SELECT ti.transfer_receipt_id AS receiptId, tr.stock_request_id AS requestId,
                    ti.product_variant_id AS variantId
             FROM transfer_receipt_items ti JOIN transfer_receipts tr ON tr.id = ti.transfer_receipt_id
             WHERE ti.id = ?`,
            { replacements: [input.transferItemId], transaction, type: QueryTypes.SELECT },
        );
        const identity = identities[0];
        if (!identity) return { kind: "transfer_item_not_approvable" };
        const receiptId = serializeDatabaseEntityId(identity.receiptId);
        const requestId = identity.requestId === null ? null : serializeDatabaseEntityId(identity.requestId);
        const request = requestId === null ? null : (await this.persistence.sequelize.query<RequestRow>(
            "SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status FROM stock_requests WHERE id = ? FOR UPDATE",
            { replacements: [requestId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            "SELECT stock_request_id AS requestId, from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status FROM transfer_receipts WHERE id = ? FOR UPDATE",
            { replacements: [receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!receipt || receipt.status !== "approved" || (requestId !== null && (
            !request || request.status !== "approved"
            || serializeDatabaseEntityId(request.fromBranchId) !== serializeDatabaseEntityId(receipt.toBranchId)
            || serializeDatabaseEntityId(request.toBranchId) !== serializeDatabaseEntityId(receipt.fromBranchId)
        )) || (receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId) {
            return { kind: "transfer_item_not_approvable" };
        }
        const item = (await this.persistence.sequelize.query<ItemRow>(
            "SELECT product_variant_id AS variantId, quantity FROM transfer_receipt_items WHERE id = ? AND transfer_receipt_id = ? FOR UPDATE",
            { replacements: [input.transferItemId, receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const quantity = positiveInt(item?.quantity);
        if (!item || !quantity || serializeDatabaseEntityId(item.variantId) !== serializeDatabaseEntityId(identity.variantId)) {
            return { kind: "transfer_item_not_approvable" };
        }
        const inventory = (await this.persistence.sequelize.query<InventoryRow>(
            `SELECT id, branch_id AS branchId, product_variant_id AS variantId, stock FROM inventories
             WHERE branch_id = ? AND product_variant_id = ? FOR UPDATE`,
            { replacements: [receipt.fromBranchId, item.variantId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!inventory) return { kind: "insufficient_stock" };
        if (serializeDatabaseEntityId(inventory.branchId) !== serializeDatabaseEntityId(receipt.fromBranchId)
            || serializeDatabaseEntityId(inventory.variantId) !== serializeDatabaseEntityId(item.variantId)) {
            throw new Error("Transfer inventory source changed.");
        }
        const inventoryId = serializeDatabaseEntityId(inventory.id);
        const activeHolds = await this.persistence.sequelize.query<{ id: unknown; quantity: unknown; transferItemId: unknown }>(
            `SELECT id, quantity, transfer_receipt_item_id AS transferItemId FROM inventory_reservations
             WHERE inventory_id = ? AND status = 'active' ORDER BY id ASC FOR UPDATE`,
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const existing = (await this.persistence.sequelize.query<HoldRow>(
            `SELECT id, transfer_receipt_item_id AS transferItemId, inventory_id AS inventoryId,
                    quantity, status, confirmed_at AS confirmedAt, expires_at AS expiresAt
             FROM inventory_reservations WHERE idempotency_key = ? FOR UPDATE`,
            { replacements: [input.idempotencyKey], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (existing) {
            const same = existing.transferItemId !== null
                && serializeDatabaseEntityId(existing.transferItemId) === input.transferItemId
                && serializeDatabaseEntityId(existing.inventoryId) === inventoryId
                && positiveInt(existing.quantity) === quantity && existing.status === "active"
                && existing.confirmedAt !== null && existing.expiresAt === null;
            return same ? { kind: "replayed", reservationId: serializeDatabaseEntityId(existing.id), quantity }
                : { kind: "idempotency_conflict" };
        }
        if (activeHolds.some((hold) => hold.transferItemId !== null
            && serializeDatabaseEntityId(hold.transferItemId) === input.transferItemId)) {
            return { kind: "already_reserved" };
        }
        const stock = nonnegativeInt(inventory.stock);
        if (stock === null) throw new Error("Invalid transfer source stock.");
        const reserved = activeHolds.reduce((sum, hold) => {
            const held = positiveInt(hold.quantity);
            if (!held || !Number.isSafeInteger(sum + held)) throw new Error("Invalid active hold quantity.");
            return sum + held;
        }, 0);
        if (reserved > stock) throw new Error("Inventory invariant violated before transfer approval.");
        if (stock - reserved < quantity) return { kind: "insufficient_stock" };
        const [id] = await this.persistence.sequelize.query(
            `INSERT INTO inventory_reservations (inventory_id, transfer_receipt_item_id, quantity, status,
                confirmed_at, idempotency_key, created_at, updated_at)
             VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [inventoryId, input.transferItemId, quantity, input.idempotencyKey],
                transaction, type: QueryTypes.INSERT },
        );
        return { kind: "reserved", reservationId: serializeDatabaseEntityId(id), quantity };
    }
}
