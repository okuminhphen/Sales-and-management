import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { TransferReceiptItemInput, TransferReceiptWrite } from "./transfer-receipt-v2.service.js";

export type TransferDiscrepancyResult = { kind: "recorded" | "forbidden" | "invalid_discrepancy"
    | "transfer_not_found" | "transfer_already_processed" | "already_recorded"
    | "transfer_conflict" | "transfer_unavailable" };
export interface TransferDiscrepancyV2Repository {
    findDestinationBranch: (id: EntityId) => Promise<EntityId | null>;
    record: (id: EntityId, actorAccountId: EntityId, toBranchId: EntityId,
        items: readonly TransferReceiptWrite[], note: string) => Promise<TransferDiscrepancyResult>;
}

/** Records observed loss/damage without changing destination stock; approval is a separate actor's action. */
export class TransferDiscrepancyV2Service {
    constructor(private readonly dependencies: { repository: TransferDiscrepancyV2Repository }) {}

    async record(context: V2AccessContext, idInput: unknown,
        input: readonly TransferReceiptItemInput[], noteInput: unknown): Promise<TransferDiscrepancyResult> {
        let id: EntityId;
        let actorAccountId: EntityId;
        try { id = serializeEntityId(idInput); actorAccountId = serializeEntityId(context.accountId); }
        catch { return { kind: "invalid_discrepancy" }; }
        const note = typeof noteInput === "string" ? noteInput.trim() : "";
        if (note.length < 1 || note.length > 500 || !Array.isArray(input)
            || input.length < 1 || input.length > 100) return { kind: "invalid_discrepancy" };
        const items: TransferReceiptWrite[] = [];
        const seen = new Set<EntityId>();
        for (const item of input) {
            let itemId: EntityId;
            try { itemId = serializeEntityId(item.itemId); }
            catch { return { kind: "invalid_discrepancy" }; }
            if (seen.has(itemId) || [item.receivedQuantity, item.lostQuantity, item.nonSellableQuantity]
                .some((quantity) => !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2_147_483_647)) {
                return { kind: "invalid_discrepancy" };
            }
            seen.add(itemId);
            items.push({ itemId, receivedQuantity: item.receivedQuantity,
                lostQuantity: item.lostQuantity, nonSellableQuantity: item.nonSellableQuantity });
        }
        if (!items.some((item) => item.lostQuantity > 0 || item.nonSellableQuantity > 0)) {
            return { kind: "invalid_discrepancy" };
        }
        try {
            const branchId = await this.dependencies.repository.findDestinationBranch(id);
            if (!branchId) return { kind: "transfer_not_found" };
            if (!canAccessBranch(context, branchId, "transfer.manage.branch")
                && !hasGlobalPermission(context, "transfer.manage.branch")) return { kind: "forbidden" };
            return await this.dependencies.repository.record(id, actorAccountId, branchId, items, note);
        } catch { return { kind: "transfer_unavailable" }; }
    }
}
