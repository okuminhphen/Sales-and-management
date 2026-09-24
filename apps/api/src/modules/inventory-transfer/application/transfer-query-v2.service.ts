import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferReceiptSummary = {
    id: EntityId; code: string; stockRequestId: EntityId | null;
    fromBranchId: EntityId; toBranchId: EntityId; status: string;
    createdBy: EntityId; approvedBy: EntityId | null;
    approvedAt: string | null; dispatchedAt: string | null; completedAt: string | null;
    createdAt: string; updatedAt: string;
    fromBranch: { id: EntityId; name: string }; toBranch: { id: EntityId; name: string };
    items: readonly { id: EntityId; productSizeId: EntityId; quantity: number;
        receivedQuantity: number; lostQuantity: number; nonSellableQuantity: number; note: string | null;
        productSize: { id: EntityId; product: { id: EntityId; name: string };
            size: { id: EntityId; name: string } } }[];
    histories: readonly { id: EntityId; action: string; performedBy: EntityId;
        note: string | null; createdAt: string }[];
};
export type TransferReceiptPage = { receipts: readonly TransferReceiptSummary[];
    page: number; limit: number; totalItems: number };
export type TransferListOutcome = { kind: "receipts"; page: TransferReceiptPage }
    | { kind: "forbidden" | "invalid_transfer" | "transfer_unavailable" };
export type TransferDetailOutcome = { kind: "receipt"; receipt: TransferReceiptSummary }
    | { kind: "forbidden" | "invalid_transfer" | "transfer_not_found" | "transfer_unavailable" };

export interface TransferQueryV2Repository {
    /** null = global visibility; an explicit list scopes source or destination branch. */
    list: (visibleBranchIds: readonly EntityId[] | null, page: number, limit: number) => Promise<TransferReceiptPage>;
    detail: (id: EntityId, visibleBranchIds: readonly EntityId[] | null) => Promise<TransferReceiptSummary | null>;
}

const visibility = (context: V2AccessContext): readonly EntityId[] | null => {
    if (hasGlobalPermission(context, "transfer.read.branch")) return null;
    const ids = new Set<EntityId>();
    for (const grant of context.grants) {
        if (grant.roleCode === "CUSTOMER" || grant.scope.type !== "branch"
            || !grant.permissions.includes("transfer.read.branch")) continue;
        try { ids.add(serializeEntityId(grant.scope.branchId)); } catch { /* Ignore a malformed grant. */ }
    }
    return [...ids].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
};

/** The read boundary never trusts caller-supplied branch IDs or JWT role claims. */
export class TransferQueryV2Service {
    constructor(private readonly dependencies: { repository: TransferQueryV2Repository }) {}

    async list(context: V2AccessContext, page: number, limit: number): Promise<TransferListOutcome> {
        if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
            || !Number.isSafeInteger((page - 1) * limit)) return { kind: "invalid_transfer" };
        const branches = visibility(context);
        if (branches !== null && branches.length === 0) return { kind: "forbidden" };
        try { return { kind: "receipts", page: await this.dependencies.repository.list(branches, page, limit) }; }
        catch { return { kind: "transfer_unavailable" }; }
    }

    async detail(context: V2AccessContext, idInput: unknown): Promise<TransferDetailOutcome> {
        let id: EntityId;
        try { id = serializeEntityId(idInput); } catch { return { kind: "invalid_transfer" }; }
        const branches = visibility(context);
        if (branches !== null && branches.length === 0) return { kind: "forbidden" };
        try {
            const receipt = await this.dependencies.repository.detail(id, branches);
            return receipt ? { kind: "receipt", receipt } : { kind: "transfer_not_found" };
        } catch { return { kind: "transfer_unavailable" }; }
    }
}
