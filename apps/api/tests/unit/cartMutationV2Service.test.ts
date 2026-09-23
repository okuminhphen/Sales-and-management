import { describe, expect, it, vi } from "vitest";
import { CartMutationV2Service } from "../../src/modules/commerce/application/cart-mutation-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const customer: V2AccessContext = {
    accountId: "1", customerId: "42", employeeId: null, grants: [],
};

describe("CartMutationV2Service", () => {
    it("uses the customer from the access context and canonical variant ID", async () => {
        const add = vi.fn().mockResolvedValue({ kind: "added", quantity: 3 });
        const service = new CartMutationV2Service({ repository: { add, remove: vi.fn(), update: vi.fn() } });

        await expect(service.add(customer, { productVariantId: "0007", quantity: 3 }))
            .resolves.toEqual({ kind: "added", quantity: 3 });
        expect(add).toHaveBeenCalledWith("42", "7", 3);
    });

    it("rejects non-customer contexts and invalid IDs/quantities without a write", async () => {
        const add = vi.fn();
        const service = new CartMutationV2Service({ repository: { add, remove: vi.fn(), update: vi.fn() } });
        await expect(service.add({ ...customer, customerId: null }, { productVariantId: "7", quantity: 1 }))
            .resolves.toEqual({ kind: "customer_profile_required" });
        for (const input of [
            { productVariantId: 7, quantity: 1 },
            { productVariantId: "0", quantity: 1 },
            { productVariantId: "7", quantity: 0 },
            { productVariantId: "7", quantity: 2_147_483_648 },
            { productVariantId: "7", quantity: 1.5 },
        ]) {
            await expect(service.add(customer, input)).resolves.toEqual({ kind: "invalid_cart_item" });
        }
        expect(add).not.toHaveBeenCalled();
    });

    it("maps unavailable catalog and quantity overflow as business results", async () => {
        const add = vi.fn()
            .mockResolvedValueOnce({ kind: "variant_unavailable" })
            .mockResolvedValueOnce({ kind: "quantity_limit_exceeded" });
        const service = new CartMutationV2Service({ repository: { add, remove: vi.fn(), update: vi.fn() } });
        await expect(service.add(customer, { productVariantId: "7", quantity: 1 }))
            .resolves.toEqual({ kind: "variant_unavailable" });
        await expect(service.add(customer, { productVariantId: "7", quantity: 1 }))
            .resolves.toEqual({ kind: "quantity_limit_exceeded" });
    });

    it("does not leak persistence errors", async () => {
        const service = new CartMutationV2Service({
            repository: { add: vi.fn().mockRejectedValue(new Error("SQL details")), remove: vi.fn(), update: vi.fn() },
        });
        await expect(service.add(customer, { productVariantId: "7", quantity: 1 }))
            .resolves.toEqual({ kind: "cart_unavailable" });
    });

    it("removes only by DB-derived customer and rejects invalid item IDs", async () => {
        const remove = vi.fn().mockResolvedValue({ kind: "removed" });
        const service = new CartMutationV2Service({ repository: { add: vi.fn(), remove, update: vi.fn() } });
        await expect(service.remove(customer, { cartItemId: "0009" }))
            .resolves.toEqual({ kind: "removed" });
        expect(remove).toHaveBeenCalledWith("42", "9");
        await expect(service.remove(customer, { cartItemId: 9 }))
            .resolves.toEqual({ kind: "invalid_cart_item" });
        await expect(service.remove({ ...customer, customerId: null }, { cartItemId: "9" }))
            .resolves.toEqual({ kind: "customer_profile_required" });
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it("does not reveal whether an item belongs to another customer", async () => {
        const service = new CartMutationV2Service({
            repository: { add: vi.fn(), remove: vi.fn().mockResolvedValue({ kind: "item_not_found" }), update: vi.fn() },
        });
        await expect(service.remove(customer, { cartItemId: "9" }))
            .resolves.toEqual({ kind: "item_not_found" });
    });

    it("updates quantity only for the DB-derived owner", async () => {
        const update = vi.fn().mockResolvedValue({ kind: "updated", quantity: 4 });
        const service = new CartMutationV2Service({
            repository: { add: vi.fn(), remove: vi.fn(), update },
        });
        await expect(service.update(customer, { cartItemId: "0009", quantity: 4 }))
            .resolves.toEqual({ kind: "updated", quantity: 4 });
        expect(update).toHaveBeenCalledWith("42", "9", 4);
        await expect(service.update(customer, { cartItemId: 9, quantity: 4 }))
            .resolves.toEqual({ kind: "invalid_cart_item" });
        await expect(service.update(customer, { cartItemId: "9", quantity: 0 }))
            .resolves.toEqual({ kind: "invalid_cart_item" });
        await expect(service.update({ ...customer, customerId: null }, { cartItemId: "9", quantity: 4 }))
            .resolves.toEqual({ kind: "customer_profile_required" });
        expect(update).toHaveBeenCalledTimes(1);
    });
});
