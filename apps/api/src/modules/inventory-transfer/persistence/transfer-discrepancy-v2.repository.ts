import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferDiscrepancyResult, TransferDiscrepancyV2Repository } from "../application/transfer-discrepancy-v2.service.js";
import type { TransferReceiptWrite } from "../application/transfer-receipt-v2.service.js";

type ReceiptRow = { requestId: unknown; toBranchId: unknown; status: string };
type ItemRow = { id: unknown; quantity: unknown };

export class SequelizeTransferDiscrepancyV2Repository implements TransferDiscrepancyV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findDestinationBranch(id: EntityId): Promise<EntityId | null> {
        const rows = await this.persistence.sequelize.query<{ toBranchId: unknown }>(
            "SELECT to_branch_id AS toBranchId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], type: QueryTypes.SELECT });
        return rows[0] ? serializeDatabaseEntityId(rows[0].toBranchId) : null;
    }

    async record(id: EntityId, actorAccountId: EntityId, toBranchId: EntityId,
        items: readonly TransferReceiptWrite[], note: string): Promise<TransferDiscrepancyResult> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.recordLocked(id, actorAccountId, toBranchId, items, note, transaction)));
    }

    private async recordLocked(id: EntityId, actorAccountId: EntityId, toBranchId: EntityId,
        items: readonly TransferReceiptWrite[], note: string,
        transaction: Transaction): Promise<TransferDiscrepancyResult> {
        const identities = await this.persistence.sequelize.query<{ requestId: unknown }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (identities.length === 0) return { kind: "transfer_not_found" };
        const requestId = identities[0].requestId === null ? null : serializeDatabaseEntityId(identities[0].requestId);
        if (requestId !== null) {
            await this.persistence.sequelize.query("SELECT id FROM stock_requests WHERE id = ? FOR UPDATE",
                { replacements: [requestId], transaction, type: QueryTypes.SELECT });
        }
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            `SELECT stock_request_id AS requestId, to_branch_id AS toBranchId, status
             FROM transfer_receipts WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT }))[0];
        if (!receipt) return { kind: "transfer_not_found" };
        if (serializeDatabaseEntityId(receipt.toBranchId) !== toBranchId
            || (receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId) {
            return { kind: "transfer_conflict" };
        }
        if (receipt.status !== "in_transit") return { kind: "transfer_already_processed" };
        const existing = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM transfer_history WHERE transfer_receipt_id = ? AND action = 'RECEIPT_RECORDED' FOR UPDATE",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (existing.length > 0) return { kind: "already_recorded" };
        const storedItems = await this.persistence.sequelize.query<ItemRow>(
            `SELECT id, quantity FROM transfer_receipt_items
             WHERE transfer_receipt_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        const submitted = new Map(items.map((item) => [item.itemId, item]));
        if (storedItems.length !== items.length || storedItems.length === 0) return { kind: "transfer_conflict" };
        let hasDiscrepancy = false;
        for (const item of storedItems) {
            const input = submitted.get(serializeDatabaseEntityId(item.id));
            const quantity = Number(item.quantity);
            if (!input || !Number.isSafeInteger(quantity) || quantity < 1
                || input.receivedQuantity + input.lostQuantity + input.nonSellableQuantity !== quantity) {
                return { kind: "transfer_conflict" };
            }
            hasDiscrepancy ||= input.lostQuantity > 0 || input.nonSellableQuantity > 0;
        }
        if (!hasDiscrepancy) return { kind: "transfer_conflict" };
        for (const item of storedItems) {
            const input = submitted.get(serializeDatabaseEntityId(item.id))!;
            await this.persistence.sequelize.query(
                `UPDATE transfer_receipt_items SET received_quantity = ?, lost_quantity = ?,
                    non_sellable_quantity = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
                { replacements: [input.receivedQuantity, input.lostQuantity,
                    input.nonSellableQuantity, item.id], transaction });
        }
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'RECEIPT_RECORDED', ?, ?, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId, note], transaction });
        return { kind: "recorded" };
    }
}
