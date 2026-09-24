import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferReleaseOutcome = { kind:
    "released" | "replayed" | "transfer_not_cancelled" | "hold_not_found" | "already_dispatched" | "reservation_finalized";
};

type IdentityRow = { receiptId: unknown; requestId: unknown; inventoryId: unknown; reservationId: unknown };
type ReceiptRow = { fromBranchId: unknown; toBranchId: unknown; status: string };
type RequestRow = { fromBranchId: unknown; toBranchId: unknown };
type ItemRow = { variantId: unknown; quantity: unknown };
type InventoryRow = { branchId: unknown; variantId: unknown };
type HoldRow = { transferItemId: unknown; inventoryId: unknown; quantity: unknown; status: string };

const positiveInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/** Release a cancelled/rejected transfer before source dispatch; stock was never debited. */
export class SequelizeInventoryTransferReleaseV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    async releaseCancelledTransferItem(transferItemId: EntityId): Promise<TransferReleaseOutcome> {
        const work = (transaction: Transaction) => this.releaseLocked(transferItemId, transaction);
        return this.transaction ? work(this.transaction)
            : retryV2Transaction(() => this.persistence.inTransaction(work));
    }

    private async releaseLocked(transferItemId: EntityId, transaction: Transaction): Promise<TransferReleaseOutcome> {
        const identities = await this.persistence.sequelize.query<IdentityRow>(
            `SELECT tr.id AS receiptId, tr.stock_request_id AS requestId,
                    r.inventory_id AS inventoryId, r.id AS reservationId
             FROM transfer_receipt_items ti JOIN transfer_receipts tr ON tr.id = ti.transfer_receipt_id
             LEFT JOIN inventory_reservations r ON r.transfer_receipt_item_id = ti.id WHERE ti.id = ?`,
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        const identity = identities[0];
        if (!identity || identity.inventoryId === null || identity.reservationId === null) return { kind: "hold_not_found" };
        if (identities.length !== 1) throw new Error("Multiple holds for one transfer item.");
        const receiptId = serializeDatabaseEntityId(identity.receiptId);
        const requestId = identity.requestId === null ? null : serializeDatabaseEntityId(identity.requestId);
        const inventoryId = serializeDatabaseEntityId(identity.inventoryId);
        const reservationId = serializeDatabaseEntityId(identity.reservationId);
        const request = requestId === null ? null : (await this.persistence.sequelize.query<RequestRow>(
            "SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId FROM stock_requests WHERE id = ? FOR UPDATE",
            { replacements: [requestId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            "SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status FROM transfer_receipts WHERE id = ? FOR UPDATE",
            { replacements: [receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!receipt) throw new Error("Transfer receipt disappeared.");
        if (requestId !== null && (!request
            || serializeDatabaseEntityId(request.fromBranchId) !== serializeDatabaseEntityId(receipt.toBranchId)
            || serializeDatabaseEntityId(request.toBranchId) !== serializeDatabaseEntityId(receipt.fromBranchId))) {
            throw new Error("Transfer request direction mismatch.");
        }
        if (!["cancelled", "rejected"].includes(receipt.status)) return { kind: "transfer_not_cancelled" };
        const item = (await this.persistence.sequelize.query<ItemRow>(
            "SELECT product_variant_id AS variantId, quantity FROM transfer_receipt_items WHERE id = ? AND transfer_receipt_id = ? FOR UPDATE",
            { replacements: [transferItemId, receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const inventory = (await this.persistence.sequelize.query<InventoryRow>(
            "SELECT branch_id AS branchId, product_variant_id AS variantId FROM inventories WHERE id = ? FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const holds = await this.persistence.sequelize.query<HoldRow>(
            `SELECT transfer_receipt_item_id AS transferItemId, inventory_id AS inventoryId, quantity, status
             FROM inventory_reservations WHERE id = ? FOR UPDATE`,
            { replacements: [reservationId], transaction, type: QueryTypes.SELECT },
        );
        const hold = holds[0];
        if (!item || !inventory || !hold || item.variantId === null || hold.transferItemId === null
            || serializeDatabaseEntityId(hold.transferItemId) !== transferItemId
            || serializeDatabaseEntityId(hold.inventoryId) !== inventoryId
            || serializeDatabaseEntityId(inventory.branchId) !== serializeDatabaseEntityId(receipt.fromBranchId)
            || serializeDatabaseEntityId(inventory.variantId) !== serializeDatabaseEntityId(item.variantId)
            || !positiveInt(item.quantity) || positiveInt(item.quantity) !== positiveInt(hold.quantity)) {
            throw new Error("Transfer hold source mismatch.");
        }
        if (hold.status === "released") return { kind: "replayed" };
        const movements = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT id FROM inventory_movements WHERE transfer_receipt_item_id = ?
             AND reason = 'transfer_dispatch' ORDER BY id ASC FOR UPDATE`,
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        if (movements.length > 0) return { kind: "already_dispatched" };
        if (hold.status !== "active") return { kind: "reservation_finalized" };
        await this.persistence.sequelize.query(
            "UPDATE inventory_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [reservationId], transaction },
        );
        return { kind: "released" };
    }
}
