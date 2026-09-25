import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferReceiptResult, TransferReceiptV2Repository,
    TransferReceiptWrite } from "../application/transfer-receipt-v2.service.js";
import { SequelizeInventoryTransferReceiptV2Repository } from "./inventory-transfer-receipt-v2.repository.js";

type ReceiptRow = { requestId: unknown; toBranchId: unknown; status: string };
type ItemRow = { id: unknown; quantity: unknown };
class ReceiptAbort extends Error { constructor() { super("Destination receipt failed."); } }

export class SequelizeTransferReceiptV2Repository implements TransferReceiptV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findDestinationBranch(id: EntityId): Promise<EntityId | null> {
        const rows = await this.persistence.sequelize.query<{ toBranchId: unknown }>(
            "SELECT to_branch_id AS toBranchId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], type: QueryTypes.SELECT });
        return rows[0] ? serializeDatabaseEntityId(rows[0].toBranchId) : null;
    }

    async complete(id: EntityId, actorAccountId: EntityId, toBranchId: EntityId,
        items: readonly TransferReceiptWrite[]): Promise<TransferReceiptResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.completeLocked(id, actorAccountId, toBranchId, items, transaction)));
        } catch (error) {
            if (error instanceof ReceiptAbort) return { kind: "transfer_conflict" };
            throw error;
        }
    }

    private async completeLocked(id: EntityId, actorAccountId: EntityId, toBranchId: EntityId,
        items: readonly TransferReceiptWrite[], transaction: Transaction): Promise<TransferReceiptResult> {
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
        const storedItems = await this.persistence.sequelize.query<ItemRow>(
            `SELECT id, quantity FROM transfer_receipt_items
             WHERE transfer_receipt_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        // A recorded shortage is immutable until a different manager approves it. A fresh
        // full-quantity payload must not erase the observation and bypass that approval.
        const recordedDiscrepancy = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT id FROM transfer_history WHERE transfer_receipt_id = ?
             AND action = 'RECEIPT_RECORDED' ORDER BY id ASC LIMIT 1 FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (recordedDiscrepancy.length > 0) return { kind: "discrepancy_requires_approval" };
        const submitted = new Map(items.map((item) => [item.itemId, item]));
        if (storedItems.length !== items.length || storedItems.length === 0) return { kind: "transfer_conflict" };
        for (const item of storedItems) {
            const input = submitted.get(serializeDatabaseEntityId(item.id));
            const quantity = Number(item.quantity);
            if (!input || !Number.isSafeInteger(quantity) || quantity < 1
                || input.receivedQuantity + input.lostQuantity + input.nonSellableQuantity !== quantity) {
                return { kind: "transfer_conflict" };
            }
            if (input.lostQuantity > 0 || input.nonSellableQuantity > 0) {
                return { kind: "discrepancy_requires_approval" };
            }
        }
        for (const item of storedItems) {
            await this.persistence.sequelize.query(
                `UPDATE transfer_receipt_items SET received_quantity = quantity,
                    updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
                { replacements: [item.id], transaction });
        }
        await this.persistence.sequelize.query(
            `UPDATE transfer_receipts SET status = 'completed', completed_at = CURRENT_TIMESTAMP(3),
                updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [id], transaction });
        const primitive = new SequelizeInventoryTransferReceiptV2Repository(this.persistence, transaction);
        for (const item of storedItems) {
            const itemId = serializeDatabaseEntityId(item.id);
            const outcome = await primitive.receiveTransferItem(itemId, `transfer:${id}:receive:${itemId}`, actorAccountId);
            if (outcome.kind !== "received") throw new ReceiptAbort();
        }
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'COMPLETED', ?, NULL, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId], transaction });
        return { kind: "completed", transferReceiptId: id };
    }
}
