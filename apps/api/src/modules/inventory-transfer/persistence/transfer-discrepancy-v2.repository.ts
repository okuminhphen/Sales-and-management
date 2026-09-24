import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferDiscrepancyResult, TransferDiscrepancyV2Repository } from "../application/transfer-discrepancy-v2.service.js";
import type { TransferReceiptWrite } from "../application/transfer-receipt-v2.service.js";
import { SequelizeInventoryTransferReceiptV2Repository } from "./inventory-transfer-receipt-v2.repository.js";

type ReceiptRow = { requestId: unknown; fromBranchId: unknown; toBranchId: unknown; status: string };
type RecordItemRow = { id: unknown; quantity: unknown };
type ItemRow = { id: unknown; quantity: unknown; receivedQuantity: unknown;
    lostQuantity: unknown; nonSellableQuantity: unknown; variantId: unknown };
class DiscrepancyAbort extends Error { constructor() { super("Discrepancy receipt failed."); } }

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

    async approve(id: EntityId, actorAccountId: EntityId, note: string): Promise<TransferDiscrepancyResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.approveLocked(id, actorAccountId, note, transaction)));
        } catch (error) {
            if (error instanceof DiscrepancyAbort) return { kind: "transfer_conflict" };
            throw error;
        }
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
            `SELECT stock_request_id AS requestId, from_branch_id AS fromBranchId,
                    to_branch_id AS toBranchId, status
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
        const storedItems = await this.persistence.sequelize.query<RecordItemRow>(
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

    private async approveLocked(id: EntityId, actorAccountId: EntityId, note: string,
        transaction: Transaction): Promise<TransferDiscrepancyResult> {
        const identities = await this.persistence.sequelize.query<{ requestId: unknown }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (identities.length === 0) return { kind: "transfer_not_found" };
        const requestId = identities[0].requestId === null ? null : serializeDatabaseEntityId(identities[0].requestId);
        const request = requestId === null ? null : (await this.persistence.sequelize.query<{
            fromBranchId: unknown; toBranchId: unknown; status: string }>(
            `SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status
             FROM stock_requests WHERE id = ? FOR UPDATE`,
            { replacements: [requestId], transaction, type: QueryTypes.SELECT }))[0];
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            `SELECT stock_request_id AS requestId, from_branch_id AS fromBranchId,
                    to_branch_id AS toBranchId, status FROM transfer_receipts WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT }))[0];
        if (!receipt) return { kind: "transfer_not_found" };
        if ((receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId
            || requestId !== null && (!request || !["approved", "fulfilled"].includes(request.status)
                || serializeDatabaseEntityId(request.fromBranchId) !== serializeDatabaseEntityId(receipt.toBranchId)
                || serializeDatabaseEntityId(request.toBranchId) !== serializeDatabaseEntityId(receipt.fromBranchId))) {
            return { kind: "transfer_conflict" };
        }
        if (receipt.status !== "in_transit") return { kind: "transfer_already_processed" };
        const histories = await this.persistence.sequelize.query<{ action: string; performedBy: unknown; note: string | null }>(
            `SELECT action, performed_by_account_id AS performedBy, note FROM transfer_history
             WHERE transfer_receipt_id = ? AND action IN ('RECEIPT_RECORDED', 'DISCREPANCY_APPROVED')
             ORDER BY id ASC FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        const recorded = histories.filter((row) => row.action === "RECEIPT_RECORDED");
        if (recorded.length !== 1 || histories.some((row) => row.action === "DISCREPANCY_APPROVED")
            || !recorded[0].note?.trim()) return { kind: "transfer_conflict" };
        if (serializeDatabaseEntityId(recorded[0].performedBy) === actorAccountId) {
            return { kind: "separation_of_duties" };
        }
        const items = await this.persistence.sequelize.query<ItemRow>(
            `SELECT id, product_variant_id AS variantId, quantity,
                    received_quantity AS receivedQuantity, lost_quantity AS lostQuantity,
                    non_sellable_quantity AS nonSellableQuantity
             FROM transfer_receipt_items WHERE transfer_receipt_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (items.length === 0 || !items.some((item) => Number(item.lostQuantity) > 0
            || Number(item.nonSellableQuantity) > 0)) return { kind: "transfer_conflict" };
        for (const item of items) {
            const values = [item.quantity, item.receivedQuantity, item.lostQuantity, item.nonSellableQuantity]
                .map((value) => Number(value));
            if (values.some((value) => !Number.isSafeInteger(value) || value < 0)
                || values[0] < 1 || values[1] + values[2] + values[3] !== values[0]) {
                return { kind: "transfer_conflict" };
            }
            if (values[1] === 0 && !await this.hasDispatchedSource(id, receipt, item, transaction)) {
                return { kind: "transfer_conflict" };
            }
        }
        await this.persistence.sequelize.query(
            `UPDATE transfer_receipts SET status = 'completed', completed_at = CURRENT_TIMESTAMP(3),
                updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [id], transaction });
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'DISCREPANCY_APPROVED', ?, ?, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId, note], transaction });
        const primitive = new SequelizeInventoryTransferReceiptV2Repository(this.persistence, transaction);
        for (const item of items) {
            if (Number(item.receivedQuantity) === 0) continue;
            const itemId = serializeDatabaseEntityId(item.id);
            const outcome = await primitive.receiveTransferItem(itemId, `transfer:${id}:receive:${itemId}`, actorAccountId);
            if (outcome.kind !== "received") throw new DiscrepancyAbort();
        }
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'COMPLETED', ?, NULL, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId], transaction });
        return { kind: "completed", transferReceiptId: id };
    }

    private async hasDispatchedSource(id: EntityId, receipt: ReceiptRow,
        item: ItemRow, transaction: Transaction): Promise<boolean> {
        const movements = await this.persistence.sequelize.query<{ quantityDelta: unknown }>(
            `SELECT quantity_delta AS quantityDelta FROM inventory_movements
             WHERE transfer_receipt_item_id = ? AND branch_id = ? AND product_variant_id = ?
             AND reason = 'transfer_dispatch' AND reference_type = 'transfer_receipt'
             AND reference_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [item.id, receipt.fromBranchId, item.variantId, id],
                transaction, type: QueryTypes.SELECT });
        const holds = await this.persistence.sequelize.query<{ status: string; quantity: unknown }>(
            `SELECT status, quantity FROM inventory_reservations
             WHERE transfer_receipt_item_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [item.id], transaction, type: QueryTypes.SELECT });
        const destinationMovements = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT id FROM inventory_movements WHERE transfer_receipt_item_id = ?
             AND branch_id = ? AND reason = 'transfer_receive' FOR UPDATE`,
            { replacements: [item.id, receipt.toBranchId], transaction, type: QueryTypes.SELECT });
        return movements.length === 1 && Number(movements[0].quantityDelta) === -Number(item.quantity)
            && holds.length === 1 && holds[0].status === "consumed"
            && Number(holds[0].quantity) === Number(item.quantity)
            && destinationMovements.length === 0;
    }
}
