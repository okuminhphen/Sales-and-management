import { describe, expect, it, vi } from "vitest";
import { PosCashCheckoutV2Service } from "../../src/modules/commerce/application/pos-cash-checkout-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const staff: V2AccessContext = {
    accountId: "7", customerId: null, employeeId: "9",
    grants: [{ roleCode: "SALES_STAFF", scope: { type: "branch", branchId: "3" },
        permissions: ["order.manage.branch"] }],
};
const input = { checkoutKey: "POS-Cash-ABC", branchId: "3", items: [{ variantId: "5", quantity: 2 }] };

describe("V2 POS cash checkout boundary", () => {
    it("requires an authorized staff actor and rejects malformed inventory intent", async () => {
        const checkout = vi.fn();
        const service = new PosCashCheckoutV2Service({ repository: { checkoutCashCarryOut: checkout } });

        expect(await service.checkoutCashCarryOut({ ...staff, employeeId: null }, input)).toEqual({ kind: "forbidden" });
        expect(await service.checkoutCashCarryOut({ ...staff, grants: [] }, input)).toEqual({ kind: "forbidden" });
        expect(await service.checkoutCashCarryOut(staff, { ...input, branchId: 3 })).toEqual({ kind: "invalid_checkout" });
        expect(await service.checkoutCashCarryOut(staff, { ...input, items: [input.items[0]!, input.items[0]!] }))
            .toEqual({ kind: "invalid_checkout" });
        expect(checkout).not.toHaveBeenCalled();
    });

    it("canonicalizes the server-authorized POS intent without accepting a browser amount", async () => {
        const checkout = vi.fn().mockResolvedValue({ kind: "created", orderId: "11" });
        const now = new Date("2026-09-25T04:00:00.000Z");
        const service = new PosCashCheckoutV2Service({ repository: { checkoutCashCarryOut: checkout }, now: () => now });

        await expect(service.checkoutCashCarryOut(staff, input)).resolves.toEqual({ kind: "created", orderId: "11" });
        expect(checkout).toHaveBeenCalledWith({
            checkoutKey: "pos-cash-abc", accountId: "7", employeeId: "9", branchId: "3",
            items: [{ variantId: "5", quantity: 2 }], reservationExpiresAt: new Date("2026-09-25T04:05:00.000Z"),
        });
    });
});
