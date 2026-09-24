import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferQueryV2Repository, TransferReceiptPage,
    TransferReceiptSummary } from "../application/transfer-query-v2.service.js";

type ReceiptRow = { id: unknown; code: string; stockRequestId: unknown;
    fromBranchId: unknown; toBranchId: unknown; status: string;
    createdBy: unknown; approvedBy: unknown; approvedAt: Date | string | null;
    dispatchedAt: Date | string | null; completedAt: Date | string | null;
    createdAt: Date | string; updatedAt: Date | string;
    fromBranchName: string; toBranchName: string };
type ItemRow = { id: unknown; receiptId: unknown; variantId: unknown; quantity: number;
    receivedQuantity: number; lostQuantity: number; nonSellableQuantity: number; note: string | null;
    productId: unknown; productName: string; sizeId: unknown; sizeName: string };
type HistoryRow = { id: unknown; receiptId: unknown; action: string; performedBy: unknown;
    note: string | null; createdAt: Date | string };

const timestamp = (value: Date | string): string => new Date(value).toISOString();
const optionalTimestamp = (value: Date | string | null): string | null => value === null ? null : timestamp(value);
const optionalId = (value: unknown): EntityId | null => value === null ? null : serializeDatabaseEntityId(value);

/** Read model for transfer list/detail; all filtering happens in SQL, before pagination. */
export class SequelizeTransferQueryV2Repository implements TransferQueryV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async list(visibleBranchIds: readonly EntityId[] | null, page: number, limit: number): Promise<TransferReceiptPage> {
        const { clause, values } = this.scope(visibleBranchIds);
        const counts = await this.persistence.sequelize.query<{ totalItems: unknown }>(
            `SELECT COUNT(*) AS totalItems FROM transfer_receipts tr WHERE ${clause}`,
            { replacements: values, type: QueryTypes.SELECT });
        const totalItems = Number(counts[0]?.totalItems);
        if (!Number.isSafeInteger(totalItems) || totalItems < 0) throw new Error("Invalid transfer receipt count.");
        const rows = await this.receiptRows(`${clause} ORDER BY tr.created_at DESC, tr.id DESC LIMIT ? OFFSET ?`,
            [...values, limit, (page - 1) * limit]);
        return { receipts: await this.attachDetails(rows), page, limit, totalItems };
    }

    async detail(id: EntityId, visibleBranchIds: readonly EntityId[] | null): Promise<TransferReceiptSummary | null> {
        const { clause, values } = this.scope(visibleBranchIds);
        const rows = await this.receiptRows(`tr.id = ? AND ${clause} LIMIT 1`, [id, ...values]);
        return (await this.attachDetails(rows))[0] ?? null;
    }

    private scope(branches: readonly EntityId[] | null): { clause: string; values: EntityId[] } {
        if (branches === null) return { clause: "1 = 1", values: [] };
        if (branches.length === 0) return { clause: "1 = 0", values: [] };
        const placeholders = branches.map(() => "?").join(", ");
        return { clause: `(tr.from_branch_id IN (${placeholders}) OR tr.to_branch_id IN (${placeholders}))`,
            values: [...branches, ...branches] };
    }

    private receiptRows(whereAndTail: string, replacements: readonly unknown[]): Promise<ReceiptRow[]> {
        return this.persistence.sequelize.query<ReceiptRow>(
            `SELECT tr.id, tr.code, tr.stock_request_id AS stockRequestId,
                    tr.from_branch_id AS fromBranchId, tr.to_branch_id AS toBranchId, tr.status,
                    tr.created_by_account_id AS createdBy, tr.approved_by_account_id AS approvedBy,
                    tr.approved_at AS approvedAt, tr.dispatched_at AS dispatchedAt,
                    tr.completed_at AS completedAt, tr.created_at AS createdAt, tr.updated_at AS updatedAt,
                    fb.name AS fromBranchName, tb.name AS toBranchName
             FROM transfer_receipts tr JOIN branches fb ON fb.id = tr.from_branch_id
             JOIN branches tb ON tb.id = tr.to_branch_id WHERE ${whereAndTail}`,
            { replacements: [...replacements], type: QueryTypes.SELECT });
    }

    private async attachDetails(rows: readonly ReceiptRow[]): Promise<TransferReceiptSummary[]> {
        if (rows.length === 0) return [];
        const ids = rows.map((row) => serializeDatabaseEntityId(row.id));
        const placeholders = ids.map(() => "?").join(", ");
        const [items, histories] = await Promise.all([
            this.persistence.sequelize.query<ItemRow>(
                `SELECT ti.id, ti.transfer_receipt_id AS receiptId, ti.product_variant_id AS variantId,
                        ti.quantity, ti.received_quantity AS receivedQuantity,
                        ti.lost_quantity AS lostQuantity, ti.non_sellable_quantity AS nonSellableQuantity,
                        ti.note, p.id AS productId, p.name AS productName, s.id AS sizeId, s.name AS sizeName
                 FROM transfer_receipt_items ti JOIN product_variants v ON v.id = ti.product_variant_id
                 JOIN products p ON p.id = v.product_id JOIN sizes s ON s.id = v.size_id
                 WHERE ti.transfer_receipt_id IN (${placeholders}) ORDER BY ti.id ASC`,
                { replacements: ids, type: QueryTypes.SELECT }),
            this.persistence.sequelize.query<HistoryRow>(
                `SELECT h.id, h.transfer_receipt_id AS receiptId, h.action,
                        h.performed_by_account_id AS performedBy, h.note, h.created_at AS createdAt
                 FROM transfer_history h WHERE h.transfer_receipt_id IN (${placeholders}) ORDER BY h.id ASC`,
                { replacements: ids, type: QueryTypes.SELECT }),
        ]);
        const itemsByReceipt = new Map<EntityId, TransferReceiptSummary["items"][number][]>();
        const historiesByReceipt = new Map<EntityId, TransferReceiptSummary["histories"][number][]>();
        for (const item of items) {
            const id = serializeDatabaseEntityId(item.receiptId);
            const variantId = serializeDatabaseEntityId(item.variantId);
            const values = itemsByReceipt.get(id) ?? [];
            values.push({ id: serializeDatabaseEntityId(item.id), productSizeId: variantId,
                quantity: item.quantity, receivedQuantity: item.receivedQuantity,
                lostQuantity: item.lostQuantity, nonSellableQuantity: item.nonSellableQuantity,
                note: item.note, productSize: { id: variantId,
                    product: { id: serializeDatabaseEntityId(item.productId), name: item.productName },
                    size: { id: serializeDatabaseEntityId(item.sizeId), name: item.sizeName } } });
            itemsByReceipt.set(id, values);
        }
        for (const history of histories) {
            const id = serializeDatabaseEntityId(history.receiptId);
            const values = historiesByReceipt.get(id) ?? [];
            values.push({ id: serializeDatabaseEntityId(history.id), action: history.action,
                performedBy: serializeDatabaseEntityId(history.performedBy), note: history.note,
                createdAt: timestamp(history.createdAt) });
            historiesByReceipt.set(id, values);
        }
        return rows.map((row) => {
            const id = serializeDatabaseEntityId(row.id);
            const fromBranchId = serializeDatabaseEntityId(row.fromBranchId);
            const toBranchId = serializeDatabaseEntityId(row.toBranchId);
            return { id, code: row.code, stockRequestId: optionalId(row.stockRequestId),
                fromBranchId, toBranchId, status: row.status,
                createdBy: serializeDatabaseEntityId(row.createdBy), approvedBy: optionalId(row.approvedBy),
                approvedAt: optionalTimestamp(row.approvedAt), dispatchedAt: optionalTimestamp(row.dispatchedAt),
                completedAt: optionalTimestamp(row.completedAt), createdAt: timestamp(row.createdAt),
                updatedAt: timestamp(row.updatedAt),
                fromBranch: { id: fromBranchId, name: row.fromBranchName },
                toBranch: { id: toBranchId, name: row.toBranchName },
                items: itemsByReceipt.get(id) ?? [], histories: historiesByReceipt.get(id) ?? [] };
        });
    }
}
