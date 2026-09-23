import { describe, expect, it, vi } from "vitest";
import {
    CartQueryV2Service,
    type CartPage,
    type CartQueryV2Repository,
} from "../../src/modules/commerce/application/cart-query-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const page: CartPage = {
    items: [{
        id: serializeEntityId("9007199254740995"),
        productId: serializeEntityId("9007199254740996"),
        productVariantId: serializeEntityId("9007199254740997"),
        sizeId: serializeEntityId("9007199254740998"),
        productName: "Giày chạy bộ",
        sizeName: "42",
        unitPrice: serializeMoney("1299000"),
        quantity: 2,
        catalogActive: true,
        images: [],
    }],
    page: 1,
    limit: 20,
    totalItems: 1,
    totalPages: 1,
};

const repository = (): CartQueryV2Repository => ({
    listByCustomerId: vi.fn(async () => page),
});

describe("CartQueryV2Service", () => {
    it("reads only the customer ID from authenticated context", async () => {
        const store = repository();
        const service = new CartQueryV2Service({ repository: store });

        await expect(service.getOwnCart(context)).resolves.toEqual({ kind: "cart", page });
        expect(store.listByCustomerId).toHaveBeenCalledWith(
            serializeEntityId(context.customerId!),
            { page: 1, limit: 20 },
        );
    });

    it("rejects absent customer profiles and unsafe pagination", async () => {
        const store = repository();
        const service = new CartQueryV2Service({ repository: store });

        await expect(service.getOwnCart({ ...context, customerId: null })).resolves.toEqual({
            kind: "customer_profile_required",
        });
        await expect(service.getOwnCart(context, { page: Number.MAX_SAFE_INTEGER, limit: 100 }))
            .resolves.toEqual({ kind: "invalid_cart_query" });
        expect(store.listByCustomerId).not.toHaveBeenCalled();
    });

    it("returns a generic failure when storage cannot be read", async () => {
        const store = repository();
        vi.mocked(store.listByCustomerId).mockRejectedValueOnce(new Error("database details"));
        const service = new CartQueryV2Service({ repository: store });

        await expect(service.getOwnCart(context)).resolves.toEqual({ kind: "cart_unavailable" });
    });
});
