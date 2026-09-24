import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type StockRequestCreateInput = {
    fromBranchId: string;
    toBranchId: string;
    items: readonly { productSizeId: string; quantity: number; note?: string | null }[];
};

export type StockRequestWrite = {
    fromBranchId: EntityId;
    toBranchId: EntityId;
    actorAccountId: EntityId;
    items: readonly { variantId: EntityId; quantity: number; note: string | null }[];
};

export type StockRequestCreateOutcome =
    | { kind: "created"; id: EntityId; code: string }
    | { kind: "forbidden" | "invalid_stock_request" | "branch_not_found" | "variant_not_found" | "stock_request_unavailable" };

export type StockRequestSummary = {
    id: EntityId; code: string; fromBranchId: EntityId; toBranchId: EntityId;
    status: string; createdBy: EntityId; approvedBy: EntityId | null; createdAt: string;
    fromBranch: { id: EntityId; name: string }; toBranch: { id: EntityId; name: string };
    items: readonly { id: EntityId; productSizeId: EntityId; quantity: number; note: string | null;
        productSize: { id: EntityId; product: { id: EntityId; name: string };
            size: { id: EntityId; name: string } } }[];
    histories: readonly { id: EntityId; action: string; performedBy: EntityId;
        note: string | null; createdAt: string }[];
};

export type StockRequestPage = { requests: readonly StockRequestSummary[];
    page: number; limit: number; totalItems: number };
export type StockRequestListOutcome = { kind: "requests"; page: StockRequestPage }
    | { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" };

export interface StockRequestV2Repository {
    create: (input: StockRequestWrite) => Promise<Exclude<StockRequestCreateOutcome,
        { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>>;
    list: (filter: { fromBranchId?: EntityId; status?: "pending" }, page: number,
        limit: number) => Promise<StockRequestPage>;
}

const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** A request records demand; it does not reserve or move supplier stock. */
export class StockRequestV2Service {
    constructor(private readonly dependencies: { repository: StockRequestV2Repository }) {}

    async create(context: V2AccessContext, input: StockRequestCreateInput): Promise<StockRequestCreateOutcome> {
        const fromBranchId = parseId(input.fromBranchId);
        const toBranchId = parseId(input.toBranchId);
        const actorAccountId = parseId(context.accountId);
        if (!fromBranchId || !toBranchId || !actorAccountId || fromBranchId === toBranchId
            || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
            return { kind: "invalid_stock_request" };
        }
        const items: StockRequestWrite["items"][number][] = [];
        const seen = new Set<EntityId>();
        for (const item of input.items) {
            const variantId = parseId(item.productSizeId);
            if (!variantId || seen.has(variantId) || !Number.isSafeInteger(item.quantity)
                || item.quantity < 1 || item.quantity > 2_147_483_647
                || item.note !== undefined && item.note !== null && (typeof item.note !== "string" || item.note.length > 500)) {
                return { kind: "invalid_stock_request" };
            }
            seen.add(variantId);
            items.push({ variantId, quantity: item.quantity, note: item.note ?? null });
        }
        if (!canAccessBranch(context, fromBranchId, "stock_request.manage.branch")
            && !hasGlobalPermission(context, "stock_request.manage.branch")) return { kind: "forbidden" };
        try { return await this.dependencies.repository.create({ fromBranchId, toBranchId, actorAccountId, items }); }
        catch { return { kind: "stock_request_unavailable" }; }
    }

    async listByBranch(context: V2AccessContext, branchIdInput: unknown,
        page: number, limit: number): Promise<StockRequestListOutcome> {
        const fromBranchId = parseId(branchIdInput);
        if (!fromBranchId || !validPage(page, limit)) return { kind: "invalid_stock_request" };
        if (!canAccessBranch(context, fromBranchId, "stock_request.read.branch")
            && !hasGlobalPermission(context, "stock_request.read.branch")) return { kind: "forbidden" };
        try { return { kind: "requests", page: await this.dependencies.repository.list({ fromBranchId }, page, limit) }; }
        catch { return { kind: "stock_request_unavailable" }; }
    }

    async listPending(context: V2AccessContext, page: number, limit: number): Promise<StockRequestListOutcome> {
        if (!validPage(page, limit)) return { kind: "invalid_stock_request" };
        if (!hasGlobalPermission(context, "stock_request.read.branch")) return { kind: "forbidden" };
        try { return { kind: "requests", page: await this.dependencies.repository.list({ status: "pending" }, page, limit) }; }
        catch { return { kind: "stock_request_unavailable" }; }
    }
}

const validPage = (page: number, limit: number): boolean => Number.isSafeInteger(page)
    && page > 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 100
    && Number.isSafeInteger((page - 1) * limit);
