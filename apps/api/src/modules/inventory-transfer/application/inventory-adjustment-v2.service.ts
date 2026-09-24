import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";

export type InventoryAdjustmentInput = {
    branchId: EntityId; variantId: EntityId; quantityDelta: number;
    reason: string; idempotencyKey: string; actorAccountId: EntityId;
};
export type InventoryAdjustmentOutcome =
    | { kind: "adjusted" | "replayed"; movementId: EntityId; balanceAfter: number }
    | { kind: "insufficient_stock" | "idempotency_conflict" };
export interface InventoryAdjustmentV2Repository {
    adjust: (input: InventoryAdjustmentInput) => Promise<InventoryAdjustmentOutcome>;
}
export type InventoryAdjustmentResult = InventoryAdjustmentOutcome
    | { kind: "forbidden" | "invalid_adjustment_input" | "inventory_unavailable" };

const id = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** Authorized manual count correction. Order/transfer/return stock changes use their own typed-source flows. */
export class InventoryAdjustmentV2Service {
    constructor(private readonly dependencies: { repository: InventoryAdjustmentV2Repository }) {}

    async adjust(context: V2AccessContext, input: {
        branchId: unknown; variantId: unknown; quantityDelta: unknown;
        reason: unknown; idempotencyKey: unknown;
    }): Promise<InventoryAdjustmentResult> {
        const branchId = id(input.branchId);
        if (!branchId) return { kind: "invalid_adjustment_input" };
        if (!canAccessBranch(context, branchId, "inventory.manage.branch")
            && !hasGlobalPermission(context, "inventory.manage.branch")) return { kind: "forbidden" };
        const variantId = id(input.variantId);
        const actorAccountId = id(context.accountId);
        if (!variantId || !actorAccountId || typeof input.quantityDelta !== "number"
            || !Number.isInteger(input.quantityDelta) || input.quantityDelta === 0
            || input.quantityDelta < -2_147_483_648 || input.quantityDelta > 2_147_483_647
            || typeof input.reason !== "string" || input.reason.trim().length === 0 || input.reason.trim().length > 100
            || typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,191}$/.test(input.idempotencyKey)) {
            return { kind: "invalid_adjustment_input" };
        }
        try {
            return await retryV2Transaction(() => this.dependencies.repository.adjust({
                branchId, variantId, actorAccountId, quantityDelta: input.quantityDelta as number,
                reason: (input.reason as string).trim(), idempotencyKey: input.idempotencyKey as string,
            }));
        } catch { return { kind: "inventory_unavailable" }; }
    }
}
