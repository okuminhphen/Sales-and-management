import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { V2AccessContext } from "../../identity-access/application/access-context.js";

export type OnlinePickupCheckoutInput = {
    checkoutKey: unknown; branchId: unknown;
    items: unknown; recipientName: unknown; recipientPhone: unknown;
    voucherCode: unknown;
};
export type PreparedOnlinePickupCheckout = {
    checkoutKey: string; accountId: EntityId; customerId: EntityId; branchId: EntityId;
    items: readonly { variantId: EntityId; quantity: number }[];
    recipientName: string; recipientPhone: string; voucherCode: string | null;
    expiresAt: Date;
};
export type OnlinePickupCheckoutResult =
    | { kind: "created" | "replayed"; orderId: EntityId }
    | { kind: "idempotency_conflict" | "product_unavailable" | "branch_unavailable"
        | "insufficient_stock" | "voucher_not_eligible" | "checkout_unavailable" };
export interface OrderCheckoutV2Repository {
    checkoutOnlinePickup: (input: PreparedOnlinePickupCheckout) => Promise<OnlinePickupCheckoutResult>;
}
export type OnlinePickupCommandResult = OnlinePickupCheckoutResult | { kind: "forbidden" | "invalid_checkout" };

const pickupContact = (value: unknown, max: number): value is string =>
    typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= max;

/** Online buyer only; POS and delivery have separate transaction requirements. */
export class OrderCheckoutV2Service {
    constructor(private readonly dependencies: { repository: OrderCheckoutV2Repository; now?: () => Date }) {}

    async checkoutOnlinePickup(context: V2AccessContext, input: OnlinePickupCheckoutInput): Promise<OnlinePickupCommandResult> {
        if (!context.customerId) return { kind: "forbidden" };
        let accountId: EntityId;
        let customerId: EntityId;
        let branchId: EntityId;
        try {
            accountId = serializeEntityId(context.accountId);
            customerId = serializeEntityId(context.customerId);
            branchId = serializeEntityId(input.branchId);
        } catch { return { kind: "invalid_checkout" }; }
        if (typeof input.checkoutKey !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(input.checkoutKey)
            || !pickupContact(input.recipientName, 255) || !pickupContact(input.recipientPhone, 30)
            || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100
            || !(input.voucherCode === null || (typeof input.voucherCode === "string"
                && /^[A-Za-z0-9_-]{1,50}$/.test(input.voucherCode)))) return { kind: "invalid_checkout" };
        const items: { variantId: EntityId; quantity: number }[] = [];
        try {
            for (const item of input.items as unknown[]) {
                if (!item || typeof item !== "object") return { kind: "invalid_checkout" };
                const candidate = item as { variantId?: unknown; quantity?: unknown };
                if (!Number.isSafeInteger(candidate.quantity) || Number(candidate.quantity) <= 0
                    || Number(candidate.quantity) > 2_147_483_647) return { kind: "invalid_checkout" };
                items.push({ variantId: serializeEntityId(candidate.variantId), quantity: Number(candidate.quantity) });
            }
        } catch { return { kind: "invalid_checkout" }; }
        items.sort((a, b) => BigInt(a.variantId) < BigInt(b.variantId) ? -1 : BigInt(a.variantId) > BigInt(b.variantId) ? 1 : 0);
        if (items.some((item, index) => index > 0 && item.variantId === items[index - 1]?.variantId)) {
            return { kind: "invalid_checkout" };
        }
        const now = this.dependencies.now?.() ?? new Date();
        if (!Number.isFinite(now.getTime())) return { kind: "checkout_unavailable" };
        try {
            return await this.dependencies.repository.checkoutOnlinePickup({
                accountId, customerId, branchId, items, checkoutKey: input.checkoutKey.toLowerCase(),
                recipientName: input.recipientName, recipientPhone: input.recipientPhone,
                voucherCode: typeof input.voucherCode === "string" ? input.voucherCode.toUpperCase() : null,
                expiresAt: new Date(now.getTime() + 15 * 60_000),
            });
        } catch { return { kind: "checkout_unavailable" }; }
    }
}
