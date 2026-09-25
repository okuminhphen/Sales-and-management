import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";

export type PosCashCheckoutInput = {
    checkoutKey: unknown;
    branchId: unknown;
    items: unknown;
};

export type PreparedPosCashCheckout = {
    checkoutKey: string;
    accountId: EntityId;
    employeeId: EntityId;
    branchId: EntityId;
    items: readonly { variantId: EntityId; quantity: number }[];
    /** Exists only while the database transaction confirms and consumes each hold. */
    reservationExpiresAt: Date;
};

export type PosCashCheckoutResult =
    | { kind: "created" | "replayed"; orderId: EntityId }
    | { kind: "idempotency_conflict" | "product_unavailable" | "branch_unavailable"
        | "insufficient_stock" | "payment_method_unavailable" | "checkout_unavailable" };

export interface PosCashCheckoutV2Repository {
    checkoutCashCarryOut: (input: PreparedPosCashCheckout) => Promise<PosCashCheckoutResult>;
}

export type PosCashCheckoutCommandResult = PosCashCheckoutResult | { kind: "forbidden" | "invalid_checkout" };

const compareEntityIds = (left: EntityId, right: EntityId): number =>
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;

/**
 * A POS sale is deliberately separate from online checkout: it never leaves a
 * pending hold. The repository reserves, confirms and consumes stock in one
 * outer transaction after this boundary has established a staff-only intent.
 */
export class PosCashCheckoutV2Service {
    constructor(private readonly dependencies: { repository: PosCashCheckoutV2Repository; now?: () => Date }) {}

    async checkoutCashCarryOut(
        context: V2AccessContext,
        input: PosCashCheckoutInput,
    ): Promise<PosCashCheckoutCommandResult> {
        let accountId: EntityId;
        let employeeId: EntityId;
        let branchId: EntityId;
        try {
            accountId = serializeEntityId(context.accountId);
            employeeId = serializeEntityId(context.employeeId);
            branchId = serializeEntityId(input.branchId);
        } catch {
            return context.employeeId === null ? { kind: "forbidden" } : { kind: "invalid_checkout" };
        }
        if (!context.employeeId || !(hasGlobalPermission(context, "order.manage.global")
            || canAccessBranch(context, branchId, "order.manage.branch"))) return { kind: "forbidden" };
        if (typeof input.checkoutKey !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(input.checkoutKey)
            || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
            return { kind: "invalid_checkout" };
        }

        const items: { variantId: EntityId; quantity: number }[] = [];
        try {
            for (const item of input.items) {
                if (!item || typeof item !== "object") return { kind: "invalid_checkout" };
                const candidate = item as { variantId?: unknown; quantity?: unknown };
                if (!Number.isSafeInteger(candidate.quantity) || Number(candidate.quantity) <= 0
                    || Number(candidate.quantity) > 2_147_483_647) return { kind: "invalid_checkout" };
                items.push({ variantId: serializeEntityId(candidate.variantId), quantity: Number(candidate.quantity) });
            }
        } catch {
            return { kind: "invalid_checkout" };
        }
        items.sort((left, right) => compareEntityIds(left.variantId, right.variantId));
        if (items.some((item, index) => index > 0 && item.variantId === items[index - 1]?.variantId)) {
            return { kind: "invalid_checkout" };
        }

        const now = this.dependencies.now?.() ?? new Date();
        if (!Number.isFinite(now.getTime())) return { kind: "checkout_unavailable" };
        try {
            return await this.dependencies.repository.checkoutCashCarryOut({
                checkoutKey: input.checkoutKey.toLowerCase(), accountId, employeeId, branchId, items,
                // This is a safety bound for an uncommitted intermediate state, not a POS hold policy.
                reservationExpiresAt: new Date(now.getTime() + 5 * 60_000),
            });
        } catch {
            return { kind: "checkout_unavailable" };
        }
    }
}
