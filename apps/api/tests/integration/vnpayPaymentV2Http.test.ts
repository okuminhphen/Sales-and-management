import { isIP } from "node:net";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { VnPayPaymentCallbackV2Service } from "../../src/modules/payment/application/vnpay-payment-callback-v2.service.js";
import { VnPayPaymentRequestV2Service } from "../../src/modules/payment/application/vnpay-payment-request-v2.service.js";
import { VnPayPaymentReturnV2Service } from "../../src/modules/payment/application/vnpay-payment-return-v2.service.js";
import type { VnPayPaymentUrlInput } from "../../src/modules/payment/application/vnpay-gateway.port.js";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { createVnPayPaymentV2Router } from "../../src/modules/payment/interfaces/http/vnpay-payment-v2.routes.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = { accountId: "1", customerId: "3", employeeId: null, grants: [] };
const verifiedCallback = {
    kind: "verified" as const,
    paymentId: serializeEntityId("42"),
    transactionReference: "V242",
    amount: serializeMoney("999000.0000"),
    providerTransactionId: "7001",
    outcome: "completed" as const,
    responseCode: "00",
    transactionStatus: "00",
    eventKey: "vnpay:V242:7001",
};

const setup = (options: {
    verification?: "verified" | "invalid";
    callbackResult?: "processed" | "replayed";
    outcome?: "completed" | "failed";
} = {}) => {
    const createPaymentUrl = vi.fn((_input: VnPayPaymentUrlInput) => ({
        url: "https://sandbox.vnpayment.vn/payment?signature=opaque",
        transactionReference: "V242",
        expiresAt: "2026-09-25T00:15:00.000Z",
    }));
    const verifyCallback = vi.fn(() => options.verification === "invalid"
        ? { kind: "invalid" as const, reason: "invalid_signature" as const }
        : { ...verifiedCallback, outcome: options.outcome ?? verifiedCallback.outcome });
    const reserve = vi.fn(async (_context: V2AccessContext, _input: { orderId: unknown; requestKey: unknown }) => ({
        kind: "created" as const,
        paymentId: serializeEntityId("42"),
        merchantReference: "vnpay:42:request-key",
        amount: serializeMoney("999000.0000"),
        status: "pending" as const,
        createdAt: new Date("2026-09-25T00:00:00.000Z"),
    }));
    const apply = vi.fn(async () => ({
        kind: options.callbackResult ?? "processed",
        paymentId: serializeEntityId("42"),
        status: "completed" as const,
    }));
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createVnPayPaymentV2Router({
        auth: createV2AuthMiddleware({
            accessContexts: { findActiveByAccountId: async () => context },
            verifyToken: () => ({ version: 2, accountId: serializeEntityId("1"),
                customerId: serializeEntityId("3"), employeeId: null, roleGrants: [] }),
        }),
        requests: new VnPayPaymentRequestV2Service({
            attempts: { reserve }, gateway: { createPaymentUrl },
        }),
        returns: new VnPayPaymentReturnV2Service({ gateway: { verifyCallback } }),
        callbacks: new VnPayPaymentCallbackV2Service({
            gateway: { verifyCallback }, repository: { apply },
        }),
    }));
    return { app, apply, createPaymentUrl, reserve, verifyCallback };
};

describe("VNPay V2 HTTP boundary", () => {
    it("requires authentication, rejects a browser-supplied price, and derives the client IP server-side", async () => {
        const { app, createPaymentUrl, reserve } = setup();
        await request(app).post("/api/v1/create-payment-url")
            .send({ orderId: "11", requestKey: "request-1" }).expect(401);
        await request(app).post("/api/v1/create-payment-url").set("Authorization", "Bearer token")
            .send({ orderId: "11", requestKey: "request-1", amount: "1.0000" }).expect(400);
        expect(reserve).not.toHaveBeenCalled();

        const response = await request(app).post("/api/v1/create-payment-url").set("Authorization", "Bearer token")
            .send({ orderId: "11", requestKey: "request-1", locale: "vn", bankCode: "NCB" });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ vnpUrl: "https://sandbox.vnpayment.vn/payment?signature=opaque" });
        expect(reserve).toHaveBeenCalledWith(context, { orderId: "11", requestKey: "request-1" });
        expect(createPaymentUrl).toHaveBeenCalledWith(expect.objectContaining({
            amount: "999000.0000", locale: "vn", bankCode: "NCB",
        }));
        const createdInput = createPaymentUrl.mock.calls.at(0)?.[0];
        expect(createdInput).toBeDefined();
        expect(isIP(createdInput?.clientIp ?? "")).not.toBe(0);
    });

    it("keeps a signed browser return presentation-only; only IPN applies the provider event", async () => {
        const { app, apply, verifyCallback } = setup();
        const browserReturn = await request(app).get("/api/v1/payment-return").query({
            vnp_TmnCode: "DEMO1234", vnp_SecureHash: "provider-signature",
        });
        expect(browserReturn.status).toBe(200);
        expect(browserReturn.body).toEqual({ status: "awaiting_confirmation" });
        expect(apply).not.toHaveBeenCalled();

        const ipn = await request(app).get("/api/v1/vnpay/ipn").query({
            vnp_TmnCode: "DEMO1234", vnp_SecureHash: "provider-signature",
        });
        expect(ipn.status).toBe(200);
        expect(ipn.body).toEqual({ RspCode: "00", Message: "Confirm Success" });
        expect(apply).toHaveBeenCalledTimes(1);
        expect(verifyCallback).toHaveBeenCalledTimes(2);
    });

    it("shows a provider-declared failure to the browser without persisting it", async () => {
        const { app, apply } = setup({ outcome: "failed" });
        const response = await request(app).get("/api/v1/payment-return").query({
            vnp_TmnCode: "DEMO1234", vnp_SecureHash: "provider-signature",
        });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "payment_failed" });
        expect(apply).not.toHaveBeenCalled();
    });

    it("returns the provider's idempotency and invalid-signature acknowledgements without exposing payment data", async () => {
        const replay = setup({ callbackResult: "replayed" });
        const replayResponse = await request(replay.app).get("/api/v1/vnpay/ipn").query({
            vnp_TmnCode: "DEMO1234", vnp_SecureHash: "provider-signature",
        });
        expect(replayResponse.status).toBe(200);
        expect(replayResponse.body).toEqual({ RspCode: "02", Message: "Payment already confirmed" });

        const invalid = setup({ verification: "invalid" });
        const invalidResponse = await request(invalid.app).get("/api/v1/vnpay/ipn").query({
            vnp_TmnCode: "DEMO1234", vnp_SecureHash: "forged",
        });
        expect(invalidResponse.status).toBe(200);
        expect(invalidResponse.body).toEqual({ RspCode: "97", Message: "Invalid signature" });
        expect(invalid.apply).not.toHaveBeenCalled();
    });

    it("rejects non-VNPay or repeated callback fields before gateway verification", async () => {
        const { app, verifyCallback } = setup();
        await request(app).get("/api/v1/payment-return").query({ unexpected: "value" }).expect(400);
        await request(app).get("/api/v1/vnpay/ipn?" + "vnp_TmnCode=DEMO&vnp_TmnCode=OTHER")
            .expect(200).expect({ RspCode: "99", Message: "Invalid request" });
        expect(verifyCallback).not.toHaveBeenCalled();
    });
});
