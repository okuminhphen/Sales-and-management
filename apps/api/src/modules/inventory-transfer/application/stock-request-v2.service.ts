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

export interface StockRequestV2Repository {
    create: (input: StockRequestWrite) => Promise<Exclude<StockRequestCreateOutcome,
        { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>>;
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
}
