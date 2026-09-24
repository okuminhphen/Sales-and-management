import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferReceiptItemInput = {
    itemId: string; receivedQuantity: number; lostQuantity: number; nonSellableQuantity: number;
};
export type TransferReceiptWrite = {
    itemId: EntityId; receivedQuantity: number; lostQuantity: number; nonSellableQuantity: number;
};
export type TransferReceiptResult = { kind: "completed"; transferReceiptId: EntityId }
    | { kind: "forbidden" | "invalid_transfer" | "transfer_not_found" | "transfer_already_processed"
        | "transfer_conflict" | "discrepancy_requires_approval" | "transfer_unavailable" };
export interface TransferReceiptV2Repository {
    findDestinationBranch: (id: EntityId) => Promise<EntityId | null>;
    complete: (id: EntityId, actorAccountId: EntityId, toBranchId: EntityId,
        items: readonly TransferReceiptWrite[]) => Promise<TransferReceiptResult>;
}

/** Full-quantity receipt only. Loss/damage follows a separate two-person approval path. */
export class TransferReceiptV2Service {
    constructor(private readonly dependencies: { repository: TransferReceiptV2Repository }) {}

    async complete(context: V2AccessContext, idInput: unknown,
        input: readonly TransferReceiptItemInput[]): Promise<TransferReceiptResult> {
        let id: EntityId;
        let actorAccountId: EntityId;
        try { id = serializeEntityId(idInput); actorAccountId = serializeEntityId(context.accountId); }
        catch { return { kind: "invalid_transfer" }; }
        if (!Array.isArray(input) || input.length < 1 || input.length > 100) return { kind: "invalid_transfer" };
        const items: TransferReceiptWrite[] = [];
        const seen = new Set<EntityId>();
        for (const item of input) {
            let itemId: EntityId;
            try { itemId = serializeEntityId(item.itemId); }
            catch { return { kind: "invalid_transfer" }; }
            if (seen.has(itemId) || [item.receivedQuantity, item.lostQuantity, item.nonSellableQuantity]
                .some((quantity) => !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2_147_483_647)) {
                return { kind: "invalid_transfer" };
            }
            seen.add(itemId);
            items.push({ itemId, receivedQuantity: item.receivedQuantity,
                lostQuantity: item.lostQuantity, nonSellableQuantity: item.nonSellableQuantity });
        }
        try {
            const branchId = await this.dependencies.repository.findDestinationBranch(id);
            if (!branchId) return { kind: "transfer_not_found" };
            if (!canAccessBranch(context, branchId, "transfer.manage.branch")
                && !hasGlobalPermission(context, "transfer.manage.branch")) return { kind: "forbidden" };
            return await this.dependencies.repository.complete(id, actorAccountId, branchId, items);
        } catch { return { kind: "transfer_unavailable" }; }
    }
}
