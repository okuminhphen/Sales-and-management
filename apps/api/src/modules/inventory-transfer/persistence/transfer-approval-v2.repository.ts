import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferApprovalOutcome, TransferApprovalV2Repository } from "../application/transfer-approval-v2.service.js";
import { SequelizeInventoryTransferReservationV2Repository } from "./inventory-transfer-reservation-v2.repository.js";

type ReceiptRow = { id: unknown; requestId: unknown; fromBranchId: unknown; toBranchId: unknown; status: string };
type RequestRow = { fromBranchId: unknown; toBranchId: unknown; status: string };
type ItemRow = { id: unknown; variantId: unknown; quantity: unknown };
type AbortKind = "insufficient_stock" | "transfer_conflict";

class ApprovalAbort extends Error {
    constructor(readonly kind: AbortKind) { super(kind); }
}

export class SequelizeTransferApprovalV2Repository implements TransferApprovalV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async approve(id: EntityId, actorAccountId: EntityId): Promise<TransferApprovalOutcome> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.approveLocked(id, actorAccountId, transaction)));
        } catch (error) {
            if (error instanceof ApprovalAbort) return { kind: error.kind };
            throw error;
        }
    }

    private async approveLocked(id: EntityId, actorAccountId: EntityId,
        transaction: Transaction): Promise<TransferApprovalOutcome> {
        // Discover FK before acquiring locks, then lock request -> receipt -> item -> inventory -> hold.
        const identities = await this.persistence.sequelize.query<{ requestId: unknown }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (identities.length === 0) return { kind: "transfer_not_found" };
        const requestId = identities[0].requestId === null ? null : serializeDatabaseEntityId(identities[0].requestId);
        const request = requestId === null ? null : (await this.persistence.sequelize.query<RequestRow>(
            `SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status
             FROM stock_requests WHERE id = ? FOR UPDATE`,
            { replacements: [requestId], transaction, type: QueryTypes.SELECT }))[0];
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            `SELECT id, stock_request_id AS requestId, from_branch_id AS fromBranchId,
                    to_branch_id AS toBranchId, status FROM transfer_receipts WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT }))[0];
        if (!receipt) return { kind: "transfer_not_found" };
        if (receipt.status !== "pending") return { kind: "transfer_already_processed" };
        if ((receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId) {
            return { kind: "transfer_conflict" };
        }
        if (requestId !== null && (!request || request.status !== "approved"
            || serializeDatabaseEntityId(request.fromBranchId) !== serializeDatabaseEntityId(receipt.toBranchId)
            || serializeDatabaseEntityId(request.toBranchId) !== serializeDatabaseEntityId(receipt.fromBranchId))) {
            return { kind: "transfer_conflict" };
        }
        const items = await this.persistence.sequelize.query<ItemRow>(
            `SELECT id, product_variant_id AS variantId, quantity FROM transfer_receipt_items
             WHERE transfer_receipt_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT });
        if (items.length === 0 || items.some((item) => !Number.isSafeInteger(Number(item.quantity))
            || Number(item.quantity) < 1 || Number(item.quantity) > 2_147_483_647)) {
            return { kind: "transfer_conflict" };
        }
        if (requestId !== null) {
            const requested = await this.persistence.sequelize.query<{ variantId: unknown; quantity: unknown }>(
                `SELECT product_variant_id AS variantId, quantity FROM stock_request_items
                 WHERE stock_request_id = ? ORDER BY product_variant_id ASC FOR UPDATE`,
                { replacements: [requestId], transaction, type: QueryTypes.SELECT });
            const requestedByVariant = new Map(requested.map((row) => [serializeDatabaseEntityId(row.variantId), Number(row.quantity)]));
            const totals = await this.persistence.sequelize.query<{ variantId: unknown; quantity: unknown }>(
                `SELECT ti.product_variant_id AS variantId, SUM(ti.quantity) AS quantity
                 FROM transfer_receipt_items ti JOIN transfer_receipts tr ON tr.id = ti.transfer_receipt_id
                 WHERE tr.stock_request_id = ? AND tr.status NOT IN ('rejected', 'cancelled')
                 GROUP BY ti.product_variant_id`,
                { replacements: [requestId], transaction, type: QueryTypes.SELECT });
            if (totals.some((row) => {
                const amount = Number(row.quantity);
                const requestedAmount = requestedByVariant.get(serializeDatabaseEntityId(row.variantId));
                return !Number.isSafeInteger(amount) || requestedAmount === undefined || amount > requestedAmount;
            })) return { kind: "transfer_conflict" };
        }
        // The primitive requires approved state. Any non-success must throw so the outer transaction rolls back it.
        await this.persistence.sequelize.query(
            `UPDATE transfer_receipts SET status = 'approved', approved_by_account_id = ?,
                approved_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [actorAccountId, id], transaction });
        const reservation = new SequelizeInventoryTransferReservationV2Repository(this.persistence, transaction);
        for (const item of items) {
            const itemId = serializeDatabaseEntityId(item.id);
            const result = await reservation.reserveTransferItem({ transferItemId: itemId,
                idempotencyKey: `transfer:${id}:reserve:${itemId}` });
            if (result.kind !== "reserved" && result.kind !== "replayed") {
                throw new ApprovalAbort(result.kind === "insufficient_stock" ? "insufficient_stock" : "transfer_conflict");
            }
        }
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'APPROVED', ?, NULL, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId], transaction });
        return { kind: "approved", transferReceiptId: id };
    }
}
