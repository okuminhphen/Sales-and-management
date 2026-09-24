import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferApprovalOutcome = { kind: "approved"; transferReceiptId: EntityId }
    | { kind: "forbidden" | "invalid_transfer" | "transfer_not_found" | "transfer_already_processed"
        | "insufficient_stock" | "transfer_conflict" | "transfer_unavailable" };

export interface TransferApprovalV2Repository {
    approve: (id: EntityId, actorAccountId: EntityId) => Promise<TransferApprovalOutcome>;
}

/** Approval reserves supplier stock; dispatch and receipt are separate state transitions. */
export class TransferApprovalV2Service {
    constructor(private readonly dependencies: { repository: TransferApprovalV2Repository }) {}

    async approve(context: V2AccessContext, idInput: unknown): Promise<TransferApprovalOutcome> {
        let id: EntityId;
        let actorAccountId: EntityId;
        try {
            id = serializeEntityId(idInput);
            actorAccountId = serializeEntityId(context.accountId);
        } catch { return { kind: "invalid_transfer" }; }
        if (!hasGlobalPermission(context, "transfer.manage.branch")) return { kind: "forbidden" };
        try { return await this.dependencies.repository.approve(id, actorAccountId); }
        catch { return { kind: "transfer_unavailable" }; }
    }
}
