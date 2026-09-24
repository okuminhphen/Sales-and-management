import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { StockRequestDecisionOutcome, StockRequestDecisionV2Repository } from "../application/stock-request-decision-v2.service.js";

type DecisionResult = Exclude<StockRequestDecisionOutcome,
    { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>;
type RequestRow = { fromBranchId: unknown; toBranchId: unknown; status: string; code: string };
type ItemRow = { variantId: unknown; quantity: unknown; note: string | null };

export class SequelizeStockRequestDecisionV2Repository implements StockRequestDecisionV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async approve(id: EntityId, actorAccountId: EntityId): Promise<DecisionResult> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) => this.approveLocked(id, actorAccountId, transaction)));
    }

    private async approveLocked(id: EntityId, actorAccountId: EntityId,
        transaction: Transaction): Promise<DecisionResult> {
        const request = await this.lockRequest(id, transaction);
        if (!request) return { kind: "request_not_found" };
        if (request.status !== "pending") return { kind: "request_already_processed" };
        const existing = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM transfer_receipts WHERE stock_request_id = ? ORDER BY id ASC FOR UPDATE",
            { replacements: [id], transaction, type: QueryTypes.SELECT },
        );
        if (existing.length > 0) throw new Error("Pending stock request already has a transfer receipt.");
        const items = await this.persistence.sequelize.query<ItemRow>(
            `SELECT product_variant_id AS variantId, quantity, note FROM stock_request_items
             WHERE stock_request_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT },
        );
        if (items.length === 0) throw new Error("Stock request has no items.");
        for (const item of items) {
            const quantity = Number(item.quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2_147_483_647) {
                throw new Error("Invalid stock request item quantity.");
            }
        }
        const provisionalCode = `TR-${randomUUID()}`;
        const [rawReceiptId] = await this.persistence.sequelize.query(
            `INSERT INTO transfer_receipts (stock_request_id, code, from_branch_id, to_branch_id,
                status, created_by_account_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            { replacements: [id, provisionalCode, request.toBranchId, request.fromBranchId, actorAccountId],
                transaction, type: QueryTypes.INSERT },
        );
        const transferReceiptId = serializeDatabaseEntityId(rawReceiptId);
        await this.persistence.sequelize.query("UPDATE transfer_receipts SET code = ? WHERE id = ?",
            { replacements: [`TR${transferReceiptId}`, transferReceiptId], transaction });
        for (const item of items) {
            await this.persistence.sequelize.query(
                `INSERT INTO transfer_receipt_items (transfer_receipt_id, product_variant_id, quantity,
                    note, created_at, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
                { replacements: [transferReceiptId, item.variantId, item.quantity, item.note], transaction },
            );
        }
        await this.persistence.sequelize.query(
            `UPDATE stock_requests SET status = 'approved', approved_by_account_id = ?,
                approved_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [actorAccountId, id], transaction },
        );
        await this.persistence.sequelize.query(
            `INSERT INTO stock_request_history (stock_request_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'APPROVED', ?, NULL, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, actorAccountId], transaction },
        );
        await this.persistence.sequelize.query(
            `INSERT INTO transfer_history (transfer_receipt_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'CREATED', ?, ?, CURRENT_TIMESTAMP(3))`,
            { replacements: [transferReceiptId, actorAccountId, `Created from ${request.code}`], transaction },
        );
        return { kind: "approved", stockRequestId: id, transferReceiptId };
    }

    async reject(id: EntityId, actorAccountId: EntityId, note: string): Promise<DecisionResult> {
        return retryV2Transaction(() => this.persistence.inTransaction(async (transaction) => {
            const request = await this.lockRequest(id, transaction);
            if (!request) return { kind: "request_not_found" };
            if (request.status !== "pending") return { kind: "request_already_processed" };
            await this.persistence.sequelize.query(
                "UPDATE stock_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
                { replacements: [id], transaction },
            );
            await this.persistence.sequelize.query(
                `INSERT INTO stock_request_history (stock_request_id, action, performed_by_account_id, note, created_at)
                 VALUES (?, 'REJECTED', ?, ?, CURRENT_TIMESTAMP(3))`,
                { replacements: [id, actorAccountId, note], transaction },
            );
            return { kind: "rejected" };
        }));
    }

    private async lockRequest(id: EntityId, transaction: Transaction): Promise<RequestRow | undefined> {
        const rows = await this.persistence.sequelize.query<RequestRow>(
            `SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status, code
             FROM stock_requests WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT },
        );
        return rows[0];
    }
}
