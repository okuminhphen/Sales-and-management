import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { createPosCashCheckoutV2Router } from "../../src/modules/commerce/interfaces/http/pos-cash-checkout-v2.routes.js";
import type { PosCashCheckoutCommandResult, PosCashCheckoutInput } from "../../src/modules/commerce/application/pos-cash-checkout-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "7", customerId: null, employeeId: "9",
    grants: [{ roleCode: "SALES_STAFF", scope: { type: "branch", branchId: "3" },
        permissions: ["order.manage.branch"] }],
};

const setup = (result: PosCashCheckoutCommandResult = { kind: "created", orderId: serializeEntityId("12") }) => {
    const checkoutCashCarryOut = vi.fn<(
        context: V2AccessContext,
        input: PosCashCheckoutInput,
    ) => Promise<PosCashCheckoutCommandResult>>().mockResolvedValue(result);
    const audit = vi.fn();
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createPosCashCheckoutV2Router({
        auth: createV2AuthMiddleware({
            accessContexts: { findActiveByAccountId: async () => context },
            verifyToken: () => ({ version: 2, accountId: serializeEntityId("7"),
                customerId: null, employeeId: serializeEntityId("9"), roleGrants: [] }),
        }),
        checkout: { checkoutCashCarryOut },
        audit,
    }));
    return { app, audit, checkoutCashCarryOut };
};

const body = { checkoutKey: "pos-http-key", branchId: "3", items: [{ variantId: "5", quantity: 2 }] };

describe("POS cash checkout V2 HTTP boundary", () => {
    it("requires a V2 session and rejects client price, payment or unknown fields before the use case", async () => {
        const { app, checkoutCashCarryOut } = setup();
        await request(app).post("/api/v1/order/in-store").send(body).expect(401);
        await request(app).post("/api/v1/order/in-store").set("Authorization", "Bearer token")
            .send({ ...body, totalPrice: "1.0000" }).expect(400);
        await request(app).post("/api/v1/order/in-store").set("Authorization", "Bearer token")
            .send({ ...body, paymentMethodId: "CASH" }).expect(400);
        expect(checkoutCashCarryOut).not.toHaveBeenCalled();
    });

    it("passes only the validated inventory intent and emits the legacy success envelope", async () => {
        const { app, audit, checkoutCashCarryOut } = setup();
        const response = await request(app).post("/api/v1/order/in-store").set("Authorization", "Bearer token")
            .send(body).expect(200);
        expect(response.body).toEqual({ EM: "Create in-store order successfully", EC: "0", DT: { id: "12" } });
        expect(checkoutCashCarryOut).toHaveBeenCalledWith(context, body);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "order.pos_cash.checkout",
            accountId: "7", resourceId: "12", statusCode: 200, outcome: "succeeded" }));
    });

    it("maps authorization, conflict and unavailable outcomes without leaking internals", async () => {
        const forbidden = setup({ kind: "forbidden" });
        await request(forbidden.app).post("/api/v1/order/in-store").set("Authorization", "Bearer token")
            .send(body).expect(403).expect({ EM: "Branch access denied", EC: "3", DT: null });

        const conflict = setup({ kind: "idempotency_conflict" });
        await request(conflict.app).post("/api/v1/order/in-store").set("Authorization", "Bearer token")
            .send(body).expect(409).expect({ EM: "Checkout intent conflicts with an existing order", EC: "1", DT: null });

        const unavailable = setup({ kind: "checkout_unavailable" });
        await request(unavailable.app).post("/api/v1/order/in-store").set("Authorization", "Bearer token")
            .send(body).expect(503).expect({ EM: "Checkout service unavailable", EC: "-1", DT: null });
    });
});
