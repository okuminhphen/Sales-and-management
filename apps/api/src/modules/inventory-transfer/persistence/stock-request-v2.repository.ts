import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { StockRequestCreateOutcome, StockRequestPage, StockRequestSummary,
    StockRequestV2Repository, StockRequestWrite, StockRequestPatch,
    PersistenceMutationOutcome } from "../application/stock-request-v2.service.js";

type CreateResult = Exclude<StockRequestCreateOutcome,
    { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>;
type RequestRow = { id: unknown; code: string; fromBranchId: unknown; toBranchId: unknown;
    status: string; createdBy: unknown; approvedBy: unknown; createdAt: Date | string;
    fromBranchName: string; toBranchName: string };
type ItemRow = { id: unknown; requestId: unknown; variantId: unknown; quantity: number;
    note: string | null; productId: unknown; productName: string; sizeId: unknown; sizeName: string };
type HistoryRow = { id: unknown; requestId: unknown; action: string; performedBy: unknown;
    note: string | null; createdAt: Date | string };
type OwnerRow = { fromBranchId: unknown; createdBy: unknown; status: string };

const timestamp = (value: Date | string): string => new Date(value).toISOString();

export class SequelizeStockRequestV2Repository implements StockRequestV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async create(input: StockRequestWrite): Promise<CreateResult> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) => this.createLocked(input, transaction)));
    }

    async list(filter: { fromBranchId?: EntityId; status?: "pending" }, page: number,
        limit: number): Promise<StockRequestPage> {
        const where = filter.fromBranchId ? "sr.from_branch_id = ?" : "sr.status = 'pending'";
        const filterValues = filter.fromBranchId ? [filter.fromBranchId] : [];
        const counts = await this.persistence.sequelize.query<{ totalItems: unknown }>(
            `SELECT COUNT(*) AS totalItems FROM stock_requests sr WHERE ${where}`,
            { replacements: filterValues, type: QueryTypes.SELECT },
        );
        const totalItems = Number(counts[0]?.totalItems);
        if (!Number.isSafeInteger(totalItems) || totalItems < 0) throw new Error("Invalid stock request count.");
        const rows = await this.persistence.sequelize.query<RequestRow>(
            `SELECT sr.id, sr.code, sr.from_branch_id AS fromBranchId, sr.to_branch_id AS toBranchId,
                    sr.status, sr.created_by_account_id AS createdBy, sr.approved_by_account_id AS approvedBy,
                    sr.created_at AS createdAt, fb.name AS fromBranchName, tb.name AS toBranchName
             FROM stock_requests sr JOIN branches fb ON fb.id = sr.from_branch_id
             JOIN branches tb ON tb.id = sr.to_branch_id WHERE ${where}
             ORDER BY sr.created_at DESC, sr.id DESC LIMIT ? OFFSET ?`,
            { replacements: [...filterValues, limit, (page - 1) * limit], type: QueryTypes.SELECT },
        );
        if (rows.length === 0) return { requests: [], page, limit, totalItems };
        const ids = rows.map((row) => serializeDatabaseEntityId(row.id));
        const placeholders = ids.map(() => "?").join(", ");
        const [items, histories] = await Promise.all([
            this.persistence.sequelize.query<ItemRow>(
                `SELECT si.id, si.stock_request_id AS requestId, si.product_variant_id AS variantId,
                        si.quantity, si.note, p.id AS productId, p.name AS productName,
                        s.id AS sizeId, s.name AS sizeName
                 FROM stock_request_items si JOIN product_variants v ON v.id = si.product_variant_id
                 JOIN products p ON p.id = v.product_id JOIN sizes s ON s.id = v.size_id
                 WHERE si.stock_request_id IN (${placeholders}) ORDER BY si.id ASC`,
                { replacements: ids, type: QueryTypes.SELECT },
            ),
            this.persistence.sequelize.query<HistoryRow>(
                `SELECT h.id, h.stock_request_id AS requestId, h.action,
                        h.performed_by_account_id AS performedBy, h.note, h.created_at AS createdAt
                 FROM stock_request_history h WHERE h.stock_request_id IN (${placeholders}) ORDER BY h.id ASC`,
                { replacements: ids, type: QueryTypes.SELECT },
            ),
        ]);
        const itemsByRequest = new Map<EntityId, StockRequestSummary["items"][number][]>();
        const historiesByRequest = new Map<EntityId, StockRequestSummary["histories"][number][]>();
        for (const item of items) {
            const requestId = serializeDatabaseEntityId(item.requestId);
            const values = itemsByRequest.get(requestId) ?? [];
            const variantId = serializeDatabaseEntityId(item.variantId);
            values.push({ id: serializeDatabaseEntityId(item.id), productSizeId: variantId,
                quantity: item.quantity, note: item.note, productSize: { id: variantId,
                    product: { id: serializeDatabaseEntityId(item.productId), name: item.productName },
                    size: { id: serializeDatabaseEntityId(item.sizeId), name: item.sizeName } } });
            itemsByRequest.set(requestId, values);
        }
        for (const history of histories) {
            const requestId = serializeDatabaseEntityId(history.requestId);
            const values = historiesByRequest.get(requestId) ?? [];
            values.push({ id: serializeDatabaseEntityId(history.id), action: history.action,
                performedBy: serializeDatabaseEntityId(history.performedBy), note: history.note,
                createdAt: timestamp(history.createdAt) });
            historiesByRequest.set(requestId, values);
        }
        return { page, limit, totalItems, requests: rows.map((row) => {
            const id = serializeDatabaseEntityId(row.id);
            const fromBranchId = serializeDatabaseEntityId(row.fromBranchId);
            const toBranchId = serializeDatabaseEntityId(row.toBranchId);
            return { id, code: row.code, fromBranchId, toBranchId, status: row.status,
                createdBy: serializeDatabaseEntityId(row.createdBy),
                approvedBy: row.approvedBy === null ? null : serializeDatabaseEntityId(row.approvedBy),
                createdAt: timestamp(row.createdAt),
                fromBranch: { id: fromBranchId, name: row.fromBranchName },
                toBranch: { id: toBranchId, name: row.toBranchName },
                items: itemsByRequest.get(id) ?? [], histories: historiesByRequest.get(id) ?? [] };
        }) };
    }

    async findOwner(id: EntityId): Promise<{ fromBranchId: EntityId; createdBy: EntityId } | null> {
        const rows = await this.persistence.sequelize.query<OwnerRow>(
            "SELECT from_branch_id AS fromBranchId, created_by_account_id AS createdBy, status FROM stock_requests WHERE id = ?",
            { replacements: [id], type: QueryTypes.SELECT },
        );
        const row = rows[0];
        return row ? { fromBranchId: serializeDatabaseEntityId(row.fromBranchId),
            createdBy: serializeDatabaseEntityId(row.createdBy) } : null;
    }

    async update(id: EntityId, actorAccountId: EntityId, fromBranchId: EntityId,
        patch: StockRequestPatch): Promise<PersistenceMutationOutcome> {
        return retryV2Transaction(() => this.persistence.inTransaction(async (transaction) => {
            const request = await this.lockOwned(id, actorAccountId, fromBranchId, transaction);
            if ("kind" in request) return request;
            if (request.status !== "pending") return { kind: "request_already_processed" };
            if (patch.toBranchId) {
                const branches = await this.persistence.sequelize.query<{ id: unknown }>(
                    "SELECT id FROM branches WHERE id = ? FOR SHARE",
                    { replacements: [patch.toBranchId], transaction, type: QueryTypes.SELECT },
                );
                if (branches.length !== 1) return { kind: "branch_not_found" };
            }
            if (patch.items) {
                const variantIds = patch.items.map((item) => item.variantId);
                const placeholders = variantIds.map(() => "?").join(", ");
                const variants = await this.persistence.sequelize.query<{ id: unknown }>(
                    `SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id
                     WHERE v.id IN (${placeholders}) AND v.status = 'active' AND p.status = 'active'
                     ORDER BY v.id ASC FOR SHARE`,
                    { replacements: variantIds, transaction, type: QueryTypes.SELECT },
                );
                if (variants.length !== variantIds.length) return { kind: "variant_not_found" };
            }
            // Validation outcomes must be decided before the first write: returning from a managed transaction commits it.
            if (patch.toBranchId) {
                await this.persistence.sequelize.query(
                    "UPDATE stock_requests SET to_branch_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
                    { replacements: [patch.toBranchId, id], transaction },
                );
            }
            if (patch.items) {
                await this.persistence.sequelize.query("DELETE FROM stock_request_items WHERE stock_request_id = ?",
                    { replacements: [id], transaction });
                for (const item of patch.items) {
                    await this.persistence.sequelize.query(
                        `INSERT INTO stock_request_items (stock_request_id, product_variant_id, quantity, note, created_at, updated_at)
                         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
                        { replacements: [id, item.variantId, item.quantity, item.note], transaction },
                    );
                }
            }
            await this.persistence.sequelize.query(
                `INSERT INTO stock_request_history (stock_request_id, action, performed_by_account_id, note, created_at)
                 VALUES (?, 'UPDATED', ?, NULL, CURRENT_TIMESTAMP(3))`,
                { replacements: [id, actorAccountId], transaction },
            );
            return { kind: "updated" };
        }));
    }

    async cancel(id: EntityId, actorAccountId: EntityId,
        fromBranchId: EntityId): Promise<PersistenceMutationOutcome> {
        return retryV2Transaction(() => this.persistence.inTransaction(async (transaction) => {
            const request = await this.lockOwned(id, actorAccountId, fromBranchId, transaction);
            if ("kind" in request) return request;
            if (request.status !== "pending") return { kind: "request_already_processed" };
            await this.persistence.sequelize.query(
                "UPDATE stock_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
                { replacements: [id], transaction },
            );
            await this.persistence.sequelize.query(
                `INSERT INTO stock_request_history (stock_request_id, action, performed_by_account_id, note, created_at)
                 VALUES (?, 'CANCELLED', ?, NULL, CURRENT_TIMESTAMP(3))`,
                { replacements: [id, actorAccountId], transaction },
            );
            return { kind: "cancelled" };
        }));
    }

    private async lockOwned(id: EntityId, actorAccountId: EntityId, fromBranchId: EntityId,
        transaction: Transaction): Promise<{ status: string } | PersistenceMutationOutcome> {
        const rows = await this.persistence.sequelize.query<OwnerRow>(
            `SELECT from_branch_id AS fromBranchId, created_by_account_id AS createdBy, status
             FROM stock_requests WHERE id = ? FOR UPDATE`,
            { replacements: [id], transaction, type: QueryTypes.SELECT },
        );
        const row = rows[0];
        if (!row) return { kind: "request_not_found" };
        if (serializeDatabaseEntityId(row.fromBranchId) !== fromBranchId
            || serializeDatabaseEntityId(row.createdBy) !== actorAccountId) return { kind: "forbidden" };
        return { status: row.status };
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
