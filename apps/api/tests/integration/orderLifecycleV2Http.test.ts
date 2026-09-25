import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { OrderCancellationCommandResult } from "../../src/modules/commerce/application/order-cancellation-v2.service.js";
import type { OrderConfirmationCommandResult } from "../../src/modules/commerce/application/order-confirmation-v2.service.js";
import { createOrderLifecycleV2Router } from "../../src/modules/commerce/interfaces/http/order-lifecycle-v2.routes.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "7", customerId: null, employeeId: "9",
    grants: [{ roleCode: "SALES_STAFF", scope: { type: "branch", branchId: "3" },
        permissions: ["order.manage.branch"] }],
};

const setup = (options: {
    confirm?: OrderConfirmationCommandResult;
    cancel?: OrderCancellationCommandResult;
} = {}) => {
    const confirm = vi.fn<(context: V2AccessContext, orderId: unknown) => Promise<OrderConfirmationCommandResult>>()
        .mockResolvedValue(options.confirm ?? { kind: "confirmed", orderId: serializeEntityId("12") });
    const cancel = vi.fn<(context: V2AccessContext, orderId: unknown, reason: unknown) => Promise<OrderCancellationCommandResult>>()
        .mockResolvedValue(options.cancel ?? { kind: "cancelled", orderId: serializeEntityId("12") });
    const audit = vi.fn();
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createOrderLifecycleV2Router({
        auth: createV2AuthMiddleware({
            accessContexts: { findActiveByAccountId: async () => context },
            verifyToken: () => ({ version: 2, accountId: serializeEntityId("7"), customerId: null,
                employeeId: serializeEntityId("9"), roleGrants: [] }),
        }),
        confirmation: { confirm }, cancellation: { cancel }, audit,
    }));
    return { app, audit, confirm, cancel };
};

describe("order lifecycle V2 HTTP boundary", () => {
    it("requires a V2 session and validates the action-specific intent before the use case", async () => {
        const { app, confirm, cancel } = setup();
        await request(app).post("/api/v1/order/12/confirm").expect(401);
        await request(app).post("/api/v1/order/not-an-id/confirm").set("Authorization", "Bearer token").expect(400);
        await request(app).post("/api/v1/order/12/confirm").set("Authorization", "Bearer token")
            .send({ reason: "ignored" }).expect(400);
        await request(app).post("/api/v1/order/12/cancel").set("Authorization", "Bearer token")
            .send({}).expect(400);
        expect(confirm).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
    });

    it("executes distinct confirm and cancellation intents with compatible envelopes and safe audit", async () => {
        const { app, audit, confirm, cancel } = setup();
        await request(app).post("/api/v1/order/12/confirm").set("Authorization", "Bearer token")
            .expect(200).expect({ EM: "Update order status successfully", EC: "0", DT: { orderId: "12" } });
        await request(app).post("/api/v1/order/12/cancel").set("Authorization", "Bearer token")
            .send({ reason: "Customer requested cancellation" })
            .expect(200).expect({ EM: "Update order status successfully", EC: "0", DT: { orderId: "12" } });
        expect(confirm).toHaveBeenCalledWith(context, "12");
        expect(cancel).toHaveBeenCalledWith(context, "12", "Customer requested cancellation");
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "order.confirm",
            accountId: "7", resourceId: "12", statusCode: 200, outcome: "succeeded" }));
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "order.cancel",
            accountId: "7", resourceId: "12", statusCode: 200, outcome: "succeeded" }));
    });

    it("maps authorization, state conflicts and unavailable persistence without leaking internals", async () => {
        const forbidden = setup({ confirm: { kind: "forbidden" } });
        await request(forbidden.app).post("/api/v1/order/12/confirm").set("Authorization", "Bearer token")
            .expect(403).expect({ EM: "Order access denied", EC: "3", DT: null });

        const payment = setup({ confirm: { kind: "payment_not_settled" } });
        await request(payment.app).post("/api/v1/order/12/confirm").set("Authorization", "Bearer token")
            .expect(409).expect({ EM: "Order cannot be confirmed", EC: "1", DT: null });

        const unresolved = setup({ cancel: { kind: "payment_unresolved" } });
        await request(unresolved.app).post("/api/v1/order/12/cancel").set("Authorization", "Bearer token")
            .send({ reason: "Customer requested cancellation" })
            .expect(409).expect({ EM: "Order cannot be cancelled", EC: "1", DT: null });

        const unavailable = setup({ cancel: { kind: "cancellation_unavailable" } });
        await request(unavailable.app).post("/api/v1/order/12/cancel").set("Authorization", "Bearer token")
            .send({ reason: "Customer requested cancellation" })
            .expect(503).expect({ EM: "Order cancellation unavailable", EC: "-1", DT: null });
    });
});
