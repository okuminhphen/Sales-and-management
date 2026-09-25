import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { OnlinePickupCheckoutInput, OnlinePickupCommandResult } from "../../src/modules/commerce/application/order-checkout-v2.service.js";
import { createOnlinePickupCheckoutV2Router } from "../../src/modules/commerce/interfaces/http/online-pickup-checkout-v2.routes.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "7", customerId: "8", employeeId: null, grants: [],
};

const setup = (result: OnlinePickupCommandResult = { kind: "created", orderId: serializeEntityId("12") }) => {
    const checkoutOnlinePickup = vi.fn<(
        context: V2AccessContext,
        input: OnlinePickupCheckoutInput,
    ) => Promise<OnlinePickupCommandResult>>().mockResolvedValue(result);
    const audit = vi.fn();
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createOnlinePickupCheckoutV2Router({
        auth: createV2AuthMiddleware({
            accessContexts: { findActiveByAccountId: async () => context },
            verifyToken: () => ({ version: 2, accountId: serializeEntityId("7"),
                customerId: serializeEntityId("8"), employeeId: null, roleGrants: [] }),
        }),
        checkout: { checkoutOnlinePickup },
        audit,
    }));
    return { app, audit, checkoutOnlinePickup };
};

const body = {
    checkoutKey: "online-pickup-http-key", branchId: "3",
    recipientName: "Nguyen Van A", recipientPhone: "0901234567", voucherCode: null,
    items: [{ variantId: "5", quantity: 2 }],
};

describe("online pickup checkout V2 HTTP boundary", () => {
    it("requires a V2 customer session and rejects client price, payment, customer or unknown fields", async () => {
        const { app, checkoutOnlinePickup } = setup();
        await request(app).post("/api/v1/order/create").send(body).expect(401);
        await request(app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send({ ...body, totalPrice: "1.0000" }).expect(400);
        await request(app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send({ ...body, paymentMethodId: "7" }).expect(400);
        await request(app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send({ ...body, customerId: "999" }).expect(400);
        expect(checkoutOnlinePickup).not.toHaveBeenCalled();
    });

    it("passes only the validated pickup intent and emits the compatible success envelope", async () => {
        const { app, audit, checkoutOnlinePickup } = setup();
        const response = await request(app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send(body).expect(200);
        expect(response.body).toEqual({ EM: "Create order successfully", EC: "0", DT: { orderId: "12" } });
        expect(checkoutOnlinePickup).toHaveBeenCalledWith(context, body);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "order.online_pickup.checkout",
            accountId: "7", resourceId: "12", statusCode: 200, outcome: "succeeded" }));
    });

    it("maps ownership, intent conflict and transient failures without leaking internals", async () => {
        const forbidden = setup({ kind: "forbidden" });
        await request(forbidden.app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send(body).expect(403).expect({ EM: "Customer identity required", EC: "3", DT: null });

        const conflict = setup({ kind: "idempotency_conflict" });
        await request(conflict.app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send(body).expect(409).expect({ EM: "Checkout intent conflicts with an existing order", EC: "1", DT: null });

        const unavailable = setup({ kind: "checkout_unavailable" });
        await request(unavailable.app).post("/api/v1/order/create").set("Authorization", "Bearer token")
            .send(body).expect(503).expect({ EM: "Checkout service unavailable", EC: "-1", DT: null });
    });
});
