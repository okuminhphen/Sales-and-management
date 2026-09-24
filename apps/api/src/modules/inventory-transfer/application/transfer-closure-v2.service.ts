import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferClosureResult = { kind: "cancelled" | "rejected" | "forbidden" | "invalid_transfer"
    | "transfer_not_found" | "transfer_already_processed" | "transfer_conflict" | "transfer_unavailable" };
export interface TransferClosureV2Repository {
    findSourceBranch: (id: EntityId) => Promise<EntityId | null>;
    close: (id: EntityId, actorAccountId: EntityId, fromBranchId: EntityId,
        action: "cancelled" | "rejected", note: string | null) => Promise<TransferClosureResult>;
}

/** A pre-dispatch closure releases holds; an in-transit receipt must use receipt/reconciliation instead. */
export class TransferClosureV2Service {
    constructor(private readonly dependencies: { repository: TransferClosureV2Repository }) {}

    private async close(context: V2AccessContext, idInput: unknown,
        action: "cancelled" | "rejected", note: unknown): Promise<TransferClosureResult> {
        let id: EntityId;
        let actorAccountId: EntityId;
        try { id = serializeEntityId(idInput); actorAccountId = serializeEntityId(context.accountId); }
        catch { return { kind: "invalid_transfer" }; }
        const normalizedNote = typeof note === "string" ? note.trim() : "";
        if (action === "rejected" && (normalizedNote.length < 1 || normalizedNote.length > 500)) {
            return { kind: "invalid_transfer" };
        }
        try {
            const branchId = await this.dependencies.repository.findSourceBranch(id);
            if (!branchId) return { kind: "transfer_not_found" };
            const allowed = action === "rejected"
                ? hasGlobalPermission(context, "transfer.manage.branch")
                : canAccessBranch(context, branchId, "transfer.manage.branch")
                    || hasGlobalPermission(context, "transfer.manage.branch");
            if (!allowed) return { kind: "forbidden" };
            return await this.dependencies.repository.close(id, actorAccountId, branchId,
                action, action === "rejected" ? normalizedNote : null);
        } catch { return { kind: "transfer_unavailable" }; }
    }

    cancel(context: V2AccessContext, id: unknown): Promise<TransferClosureResult> {
        return this.close(context, id, "cancelled", null);
    }

    reject(context: V2AccessContext, id: unknown, reason: unknown): Promise<TransferClosureResult> {
        return this.close(context, id, "rejected", reason);
    }
}
