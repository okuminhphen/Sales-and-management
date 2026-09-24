import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferClosureResult, TransferClosureV2Repository } from "../application/transfer-closure-v2.service.js";
import { SequelizeInventoryTransferReleaseV2Repository } from "./inventory-transfer-release-v2.repository.js";

type ReceiptRow = { requestId: unknown; fromBranchId: unknown; status: string };
class ClosureAbort extends Error { constructor() { super("Transfer release failed."); } }

export class SequelizeTransferClosureV2Repository implements TransferClosureV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findSourceBranch(id: EntityId): Promise<EntityId | null> {
        const rows = await this.persistence.sequelize.query<{ fromBranchId: unknown }>(
            "SELECT from_branch_id AS fromBranchId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], type: QueryTypes.SELECT });
        return rows[0] ? serializeDatabaseEntityId(rows[0].fromBranchId) : null;
    }

    async close(id: EntityId, actorAccountId: EntityId, fromBranchId: EntityId,
        action: "cancelled" | "rejected", note: string | null): Promise<TransferClosureResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.closeLocked(id, actorAccountId, fromBranchId, action, note, transaction)));
        } catch (error) {
            if (error instanceof ClosureAbort) return { kind: "transfer_conflict" };
            throw error;
        }
    }

    private async closeLocked(id: EntityId, actorAccountId: EntityId, fromBranchId: EntityId,
        action: "cancelled" | "rejected", note: string | null,
        transaction: Transaction): Promise<TransferClosureResult> {
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
            `SELECT stock_request_id AS requestId, from_branch_id AS fromBranchId, status
             FROM transfer_receipts WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT }))[0];
        if (!receipt) return { kind: "transfer_not_found" };
        if (serializeDatabaseEntityId(receipt.fromBranchId) !== fromBranchId
            || (receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId) {
            return { kind: "transfer_conflict" };
        }
        if (receipt.status !== "pending" && receipt.status !== "approved") {
            return { kind: "transfer_already_processed" };
        }
        const items = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (items.length === 0) return { kind: "transfer_conflict" };
        await this.persistence.sequelize.query(
            "UPDATE transfer_receipts SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [action, id], transaction });
        const release = new SequelizeInventoryTransferReleaseV2Repository(this.persistence, transaction);
        for (const item of items) {
            const outcome = await release.releaseCancelledTransferItem(serializeDatabaseEntityId(item.id));
            if (outcome.kind !== "released" && !(receipt.status === "pending" && outcome.kind === "hold_not_found")) {
                throw new ClosureAbort();
            }
        }
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, action.toUpperCase(), actorAccountId, note], transaction });
        return { kind: action };
    }
}
