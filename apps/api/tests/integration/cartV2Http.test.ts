import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { CartMutationV2Service } from "../../src/modules/commerce/application/cart-mutation-v2.service.js";
import { CartQueryV2Service } from "../../src/modules/commerce/application/cart-query-v2.service.js";
import { createCartV2Router } from "../../src/modules/commerce/interfaces/http/cart-v2.routes.js";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = { accountId: "1", customerId: "3", employeeId: null, grants: [] };

const setup = () => {
    const calls: string[] = [];
    const query = new CartQueryV2Service({ repository: {
        listByCustomerId: async (customerId) => {
            calls.push(`read:${customerId}`);
            return { items: [{ id: serializeEntityId("11"), productId: serializeEntityId("7"),
                productVariantId: serializeEntityId("9"), sizeId: serializeEntityId("2"),
                productName: "Áo", sizeName: "M", unitPrice: serializeMoney("1299000"), quantity: 2,
                catalogActive: true, images: [{ url: "https://example.com/ao.jpg" }] }],
                page: 1, limit: 20, totalItems: 1, totalPages: 1 };
        },
    } });
    const mutation = new CartMutationV2Service({ repository: {
        add: async (customerId, variantId, quantity) => {
            calls.push(`add:${customerId}:${variantId}:${quantity}`);
            return { kind: "added", quantity };
        },
        update: async (customerId, itemId, quantity) => {
            calls.push(`update:${customerId}:${itemId}:${quantity}`);
            return { kind: "updated", quantity };
        },
        remove: async (customerId, itemId) => {
            calls.push(`remove:${customerId}:${itemId}`);
            return { kind: "removed" };
        },
    } });
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createCartV2Router({
        auth: createV2AuthMiddleware({
            accessContexts: { findActiveByAccountId: async () => context },
            verifyToken: () => ({ version: 2, accountId: serializeEntityId("1"),
                customerId: serializeEntityId("999"), employeeId: null,
                roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }] }),
        }),
        query,
        mutation,
        variants: { findActiveId: async (productId, sizeId) => {
            calls.push(`resolve:${productId}:${sizeId}`);
            return productId === "7" && sizeId === "2" ? serializeEntityId("9") : null;
        } },
    }));
    return { app, calls };
};

describe("Cart V2 HTTP compatibility", () => {
    it("reads only the authenticated customer's cart and preserves legacy display fields", async () => {
        const { app, calls } = setup();
        await request(app).get("/api/v1/cart/read/999").expect(401);
        const response = await request(app).get("/api/v1/cart/read/999")
            .set("Authorization", "Bearer token");
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ EC: 0, DT: [{ id: "11", productId: "7", name: "Áo",
            price: "1299000.0000", size: "M", quantity: 2,
            images: [{ url: "https://example.com/ao.jpg" }] }] });
        expect(response.body.DT[0]).not.toHaveProperty("customerId");
        expect(calls).toEqual(["read:3"]);
    });

    it("translates the legacy product/size pair to a variant and ignores forged userId", async () => {
        const { app, calls } = setup();
        const response = await request(app).post("/api/v1/cart/add")
            .set("Authorization", "Bearer token")
            .send({ id: 7, sizeId: 2, quantity: 3, userId: 999 });
        expect(response.status).toBe(200);
        expect(response.body.EC).toBe(0);
        expect(calls).toEqual(["resolve:7:2", "add:3:9:3"]);
    });

    it("updates and removes only the authenticated customer's item", async () => {
        const { app, calls } = setup();
        await request(app).put("/api/v1/cart/update").set("Authorization", "Bearer token")
            .send({ cartProductSizeId: "11", quantity: 4, userId: "999" }).expect(200);
        await request(app).delete("/api/v1/cart/delete/11")
            .set("Authorization", "Bearer token").expect(200);
        expect(calls).toEqual(["update:3:11:4", "remove:3:11"]);
    });

    it("rejects malformed IDs and quantity before looking up data", async () => {
        const { app, calls } = setup();
        await request(app).post("/api/v1/cart/add").set("Authorization", "Bearer token")
            .send({ id: 7, sizeId: 2, quantity: 0 }).expect(400);
        await request(app).delete("/api/v1/cart/delete/900719925474099300000")
            .set("Authorization", "Bearer token").expect(400);
        expect(calls).toEqual([]);
    });

    it("rejects nonexistent product/size combinations without cart writes", async () => {
        const { app, calls } = setup();
        const response = await request(app).post("/api/v1/cart/add")
            .set("Authorization", "Bearer token")
            .send({ id: "7", sizeId: "3", quantity: 1 });
        expect(response.status).toBe(404);
        expect(calls).toEqual(["resolve:7:3"]);
    });
});
