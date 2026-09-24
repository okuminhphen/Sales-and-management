import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferDispatchResult = { kind: "dispatched"; transferReceiptId: EntityId }
    | { kind: "forbidden" | "invalid_transfer" | "transfer_not_found" | "transfer_already_processed"
        | "transfer_conflict" | "transfer_unavailable" };

export interface TransferDispatchV2Repository {
    findSourceBranch: (id: EntityId) => Promise<EntityId | null>;
    dispatch: (id: EntityId, actorAccountId: EntityId, fromBranchId: EntityId) => Promise<TransferDispatchResult>;
}

/** Dispatch consumes approved source holds; destination credit occurs only after receipt. */
export class TransferDispatchV2Service {
    constructor(private readonly dependencies: { repository: TransferDispatchV2Repository }) {}

    async dispatch(context: V2AccessContext, idInput: unknown): Promise<TransferDispatchResult> {
        let id: EntityId;
        let actorAccountId: EntityId;
        try {
            id = serializeEntityId(idInput);
            actorAccountId = serializeEntityId(context.accountId);
        } catch { return { kind: "invalid_transfer" }; }
        try {
            const branchId = await this.dependencies.repository.findSourceBranch(id);
            if (!branchId) return { kind: "transfer_not_found" };
            if (!canAccessBranch(context, branchId, "transfer.manage.branch")
                && !hasGlobalPermission(context, "transfer.manage.branch")) return { kind: "forbidden" };
            return await this.dependencies.repository.dispatch(id, actorAccountId, branchId);
        } catch { return { kind: "transfer_unavailable" }; }
    }
}
