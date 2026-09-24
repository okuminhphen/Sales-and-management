import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferDispatchResult, TransferDispatchV2Repository } from "../application/transfer-dispatch-v2.service.js";
import { SequelizeInventoryTransferDispatchV2Repository } from "./inventory-transfer-dispatch-v2.repository.js";

type ReceiptRow = { requestId: unknown; fromBranchId: unknown; status: string };
class DispatchAbort extends Error { constructor() { super("Transfer item dispatch failed."); } }

export class SequelizeTransferDispatchV2Repository implements TransferDispatchV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findSourceBranch(id: EntityId): Promise<EntityId | null> {
        const rows = await this.persistence.sequelize.query<{ fromBranchId: unknown }>(
            "SELECT from_branch_id AS fromBranchId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], type: QueryTypes.SELECT });
        return rows[0] ? serializeDatabaseEntityId(rows[0].fromBranchId) : null;
    }

    async dispatch(id: EntityId, actorAccountId: EntityId,
        fromBranchId: EntityId): Promise<TransferDispatchResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.dispatchLocked(id, actorAccountId, fromBranchId, transaction)));
        } catch (error) {
            if (error instanceof DispatchAbort) return { kind: "transfer_conflict" };
            throw error;
        }
    }

    private async dispatchLocked(id: EntityId, actorAccountId: EntityId,
        fromBranchId: EntityId, transaction: Transaction): Promise<TransferDispatchResult> {
        const identities = await this.persistence.sequelize.query<{ requestId: unknown }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (identities.length === 0) return { kind: "transfer_not_found" };
        const requestId = identities[0].requestId === null ? null : serializeDatabaseEntityId(identities[0].requestId);
        if (requestId !== null) {
            await this.persistence.sequelize.query(
                "SELECT id FROM stock_requests WHERE id = ? FOR UPDATE",
                { replacements: [requestId], transaction, type: QueryTypes.SELECT });
        }
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            `SELECT stock_request_id AS requestId, from_branch_id AS fromBranchId, status
             FROM transfer_receipts WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT }))[0];
        if (!receipt) return { kind: "transfer_not_found" };
        if (serializeDatabaseEntityId(receipt.fromBranchId) !== fromBranchId
            || (receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId) {
            return { kind: "transfer_conflict" };
        }
        if (receipt.status !== "approved") return { kind: "transfer_already_processed" };
        const items = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (items.length === 0) return { kind: "transfer_conflict" };
        await this.persistence.sequelize.query(
            `UPDATE transfer_receipts SET status = 'in_transit', dispatched_at = CURRENT_TIMESTAMP(3),
                updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [id], transaction });
        const primitive = new SequelizeInventoryTransferDispatchV2Repository(this.persistence, transaction);
        for (const item of items) {
            const itemId = serializeDatabaseEntityId(item.id);
            const outcome = await primitive.dispatchTransferItem(itemId, `transfer:${id}:dispatch:${itemId}`, actorAccountId);
            if (outcome.kind !== "dispatched" && outcome.kind !== "replayed") throw new DispatchAbort();
        }
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'DISPATCHED', ?, NULL, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId], transaction });
        return { kind: "dispatched", transferReceiptId: id };
    }
}
