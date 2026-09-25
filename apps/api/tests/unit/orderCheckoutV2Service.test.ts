import { describe, expect, it, vi } from "vitest";
import { OrderCheckoutV2Service } from "../../src/modules/commerce/application/order-checkout-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const context: V2AccessContext = { accountId: "11", customerId: "22", employeeId: null, grants: [] };
const input = { checkoutKey: "retry-123", branchId: "33", items: [
    { variantId: "55", quantity: 1 }, { variantId: "44", quantity: 2 },
], recipientName: "Nguyen A", recipientPhone: "0900000000", voucherCode: null };

describe("V2 online pickup checkout boundary", () => {
    it("rejects unauthenticated customers and malformed intent before repository writes", async () => {
        const checkout = vi.fn();
        const service = new OrderCheckoutV2Service({ repository: { checkoutOnlinePickup: checkout } });
        expect(await service.checkoutOnlinePickup({ ...context, customerId: null }, input)).toEqual({ kind: "forbidden" });
        expect(await service.checkoutOnlinePickup(context, { ...input, branchId: 33 })).toEqual({ kind: "invalid_checkout" });
        expect(await service.checkoutOnlinePickup(context, { ...input, items: [input.items[0]!, input.items[0]!] }))
            .toEqual({ kind: "invalid_checkout" });
        expect(await service.checkoutOnlinePickup(context, { ...input, recipientPhone: "" }))
            .toEqual({ kind: "invalid_checkout" });
        expect(checkout).not.toHaveBeenCalled();
    });

    it("canonicalizes variants and injects the server-side 15-minute expiry", async () => {
        const checkout = vi.fn().mockResolvedValue({ kind: "created", orderId: "1" });
        const now = new Date("2026-09-25T10:00:00.000Z");
        const service = new OrderCheckoutV2Service({ repository: { checkoutOnlinePickup: checkout }, now: () => now });
        expect(await service.checkoutOnlinePickup(context, input)).toEqual({ kind: "created", orderId: "1" });
        expect(checkout).toHaveBeenCalledWith({ accountId: "11", customerId: "22", branchId: "33",
            checkoutKey: "retry-123", items: [
                { variantId: "44", quantity: 2 }, { variantId: "55", quantity: 1 },
            ], recipientName: "Nguyen A", recipientPhone: "0900000000", voucherCode: null,
            expiresAt: new Date("2026-09-25T10:15:00.000Z") });
    });

    it("canonicalizes opaque checkout keys and voucher codes for MySQL's case-insensitive unique indexes", async () => {
        const checkout = vi.fn().mockResolvedValue({ kind: "created", orderId: "1" });
        const service = new OrderCheckoutV2Service({ repository: { checkoutOnlinePickup: checkout } });
        await service.checkoutOnlinePickup(context, { ...input, checkoutKey: "Retry-ABC", voucherCode: "save-10" });
        expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ checkoutKey: "retry-abc", voucherCode: "SAVE-10" }));
    });
});
