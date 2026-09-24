import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferReceiptOutcome =
    | { kind: "received" | "replayed"; balanceAfter: number }
    | { kind: "transfer_item_not_receivable" | "source_not_dispatched" | "already_received"
        | "discrepancy_requires_approval" | "idempotency_conflict" };

type IdentityRow = { receiptId: unknown; requestId: unknown };
type ReceiptRow = { requestId: unknown; fromBranchId: unknown; toBranchId: unknown; status: string };
type RequestRow = { fromBranchId: unknown; toBranchId: unknown; status: string };
type ItemRow = { variantId: unknown; quantity: unknown; receivedQuantity: unknown;
    lostQuantity: unknown; nonSellableQuantity: unknown };
type InventoryRow = { id: unknown; stock: unknown };
type MovementRow = { transferItemId: unknown; branchId: unknown; variantId: unknown;
    quantityDelta: unknown; balanceAfter: unknown; reason: string; referenceType: string; referenceId: string };

const nonnegativeInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

/** Sellable destination receipt; discrepancy approval remains with T31. */
export class SequelizeInventoryTransferReceiptV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    async receiveTransferItem(transferItemId: EntityId, operationKey: string,
        actorAccountId: EntityId): Promise<TransferReceiptOutcome> {
        if (!/^[A-Za-z0-9._:-]{1,191}$/.test(operationKey)) throw new TypeError("Invalid inventory operation key.");
        try {
            const work = (transaction: Transaction) => this.receiveLocked(transferItemId, operationKey, actorAccountId, transaction);
            return this.transaction ? await work(this.transaction)
                : await retryV2Transaction(() => this.persistence.inTransaction(work));
        } catch (error) {
            // The standalone transaction was rolled back; never swallow a write error in a caller-owned transaction.
            if (!this.transaction && (error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                return { kind: "idempotency_conflict" };
            }
            throw error;
        }
    }

    private async receiveLocked(transferItemId: EntityId, operationKey: string,
        actorAccountId: EntityId, transaction: Transaction): Promise<TransferReceiptOutcome> {
        const identities = await this.persistence.sequelize.query<IdentityRow>(
            `SELECT ti.transfer_receipt_id AS receiptId, tr.stock_request_id AS requestId
             FROM transfer_receipt_items ti JOIN transfer_receipts tr ON tr.id = ti.transfer_receipt_id
             WHERE ti.id = ?`,
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        const identity = identities[0];
        if (!identity) return { kind: "transfer_item_not_receivable" };
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
        if (!receipt || receipt.status !== "completed"
            || (receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId
            || (requestId !== null && (!request || !["approved", "fulfilled"].includes(request.status)
                || serializeDatabaseEntityId(request.fromBranchId) !== serializeDatabaseEntityId(receipt.toBranchId)
                || serializeDatabaseEntityId(request.toBranchId) !== serializeDatabaseEntityId(receipt.fromBranchId)))) {
            return { kind: "transfer_item_not_receivable" };
        }
        const item = (await this.persistence.sequelize.query<ItemRow>(
            `SELECT product_variant_id AS variantId, quantity, received_quantity AS receivedQuantity,
                    lost_quantity AS lostQuantity, non_sellable_quantity AS nonSellableQuantity
             FROM transfer_receipt_items WHERE id = ? AND transfer_receipt_id = ? FOR UPDATE`,
            { replacements: [transferItemId, receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const total = nonnegativeInt(item?.quantity);
        const received = nonnegativeInt(item?.receivedQuantity);
        if (!item || item.variantId === null || total === null || total === 0 || received === null) {
            throw new Error("Invalid transfer receipt item in database.");
        }
        if (received !== total || nonnegativeInt(item.lostQuantity) !== 0
            || nonnegativeInt(item.nonSellableQuantity) !== 0) {
            return { kind: "discrepancy_requires_approval" };
        }
        const movements = await this.persistence.sequelize.query<MovementRow>(
            `SELECT transfer_receipt_item_id AS transferItemId, branch_id AS branchId,
                    product_variant_id AS variantId, quantity_delta AS quantityDelta,
                    balance_after AS balanceAfter, reason, reference_type AS referenceType, reference_id AS referenceId
             FROM inventory_movements WHERE transfer_receipt_item_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        const source = movements.filter((row) => row.transferItemId !== null
            && serializeDatabaseEntityId(row.branchId) === serializeDatabaseEntityId(receipt.fromBranchId)
            && serializeDatabaseEntityId(row.variantId) === serializeDatabaseEntityId(item.variantId)
            && Number(row.quantityDelta) === -total && row.reason === "transfer_dispatch"
            && row.referenceType === "transfer_receipt"
            && row.referenceId === receiptId);
        if (source.length !== 1) return { kind: "source_not_dispatched" };
        const byKey = await this.persistence.sequelize.query<MovementRow>(
            `SELECT transfer_receipt_item_id AS transferItemId, branch_id AS branchId,
                    product_variant_id AS variantId, quantity_delta AS quantityDelta,
                    balance_after AS balanceAfter, reason, reference_type AS referenceType, reference_id AS referenceId
             FROM inventory_movements WHERE idempotency_key = ? FOR UPDATE`,
            { replacements: [operationKey], transaction, type: QueryTypes.SELECT },
        );
        if (byKey[0]) {
            const row = byKey[0];
            const same = row.transferItemId !== null
                && serializeDatabaseEntityId(row.transferItemId) === transferItemId
                && serializeDatabaseEntityId(row.branchId) === serializeDatabaseEntityId(receipt.toBranchId)
                && serializeDatabaseEntityId(row.variantId) === serializeDatabaseEntityId(item.variantId)
                && Number(row.quantityDelta) === received && row.reason === "transfer_receive"
                && row.referenceType === "transfer_receipt"
                && row.referenceId === receiptId;
            const previousBalance = nonnegativeInt(row.balanceAfter);
            return same && previousBalance !== null ? { kind: "replayed", balanceAfter: previousBalance }
                : { kind: "idempotency_conflict" };
        }
        if (movements.some((row) => row.transferItemId !== null
            && serializeDatabaseEntityId(row.branchId) === serializeDatabaseEntityId(receipt.toBranchId)
            && Number(row.quantityDelta) > 0)) return { kind: "already_received" };
        await this.persistence.sequelize.query(
            `INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at)
             VALUES (?, ?, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id = id`,
            { replacements: [receipt.toBranchId, item.variantId], transaction },
        );
        const inventory = (await this.persistence.sequelize.query<InventoryRow>(
            "SELECT id, stock FROM inventories WHERE branch_id = ? AND product_variant_id = ? FOR UPDATE",
            { replacements: [receipt.toBranchId, item.variantId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!inventory) throw new Error("Transfer destination inventory disappeared.");
        const holds = await this.persistence.sequelize.query<{ status: string; quantity: unknown }>(
            "SELECT status, quantity FROM inventory_reservations WHERE transfer_receipt_item_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        if (holds.length !== 1 || holds[0]?.status !== "consumed" || nonnegativeInt(holds[0]?.quantity) !== total) {
            throw new Error("Transfer source hold was not consumed.");
        }
        const stock = nonnegativeInt(inventory.stock);
        if (stock === null || stock + received > 2_147_483_647) throw new Error("Transfer destination stock overflow.");
        const balanceAfter = stock + received;
        await this.persistence.sequelize.query(
            "UPDATE inventories SET stock = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [balanceAfter, inventory.id], transaction },
        );
        await this.persistence.sequelize.query(
            `INSERT INTO inventory_movements (branch_id, product_variant_id, quantity_delta, balance_after,
                transfer_receipt_item_id, reason, reference_type, reference_id, idempotency_key,
                created_by_account_id, occurred_at, created_at)
             VALUES (?, ?, ?, ?, ?, 'transfer_receive', 'transfer_receipt', ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            { replacements: [receipt.toBranchId, item.variantId, received, balanceAfter,
                transferItemId, receiptId, operationKey, actorAccountId], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "received", balanceAfter };
    }
}
