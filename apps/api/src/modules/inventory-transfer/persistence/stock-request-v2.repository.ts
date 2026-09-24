import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type { StockRequestCreateOutcome, StockRequestV2Repository, StockRequestWrite } from "../application/stock-request-v2.service.js";

type CreateResult = Exclude<StockRequestCreateOutcome,
    { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>;

export class SequelizeStockRequestV2Repository implements StockRequestV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async create(input: StockRequestWrite): Promise<CreateResult> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) => this.createLocked(input, transaction)));
    }

    private async createLocked(input: StockRequestWrite, transaction: Transaction): Promise<CreateResult> {
        const branches = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM branches WHERE id IN (?, ?) ORDER BY id ASC FOR SHARE",
            { replacements: [input.fromBranchId, input.toBranchId], transaction, type: QueryTypes.SELECT },
        );
        if (branches.length !== 2) return { kind: "branch_not_found" };

        const variantIds = input.items.map((item) => item.variantId);
        const placeholders = variantIds.map(() => "?").join(", ");
        const variants = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id
             WHERE v.id IN (${placeholders}) AND v.status = 'active' AND p.status = 'active'
             ORDER BY v.id ASC FOR SHARE`,
            { replacements: variantIds, transaction, type: QueryTypes.SELECT },
        );
        if (variants.length !== variantIds.length) return { kind: "variant_not_found" };

        // The provisional UUID prevents a code race; the final public code derives from the inserted BIGINT ID.
        const provisionalCode = `RQ-${randomUUID()}`;
        const [rawId] = await this.persistence.sequelize.query(
            `INSERT INTO stock_requests (code, from_branch_id, to_branch_id, status,
                created_by_account_id, created_at, updated_at)
             VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            { replacements: [provisionalCode, input.fromBranchId, input.toBranchId, input.actorAccountId],
                transaction, type: QueryTypes.INSERT },
        );
        const id = serializeDatabaseEntityId(rawId);
        const code = `RQ${id}`;
        await this.persistence.sequelize.query("UPDATE stock_requests SET code = ? WHERE id = ?",
            { replacements: [code, id], transaction });
        for (const item of input.items) {
            await this.persistence.sequelize.query(
                `INSERT INTO stock_request_items (stock_request_id, product_variant_id, quantity, note, created_at, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
                { replacements: [id, item.variantId, item.quantity, item.note], transaction },
            );
        }
        await this.persistence.sequelize.query(
            `INSERT INTO stock_request_history (stock_request_id, action, performed_by_account_id, note, created_at)
             VALUES (?, 'REQUESTED', ?, NULL, CURRENT_TIMESTAMP(3))`,
            { replacements: [id, input.actorAccountId], transaction },
        );
        return { kind: "created", id, code };
    }
}
