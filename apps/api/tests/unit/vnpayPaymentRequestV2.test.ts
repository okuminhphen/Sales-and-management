import { describe, expect, it, vi } from "vitest";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";
import { VnPayPaymentRequestV2Service } from "../../src/modules/payment/application/vnpay-payment-request-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const context: V2AccessContext = {
    accountId: "10",
    customerId: "20",
    employeeId: null,
    grants: [],
};

describe("VnPayPaymentRequestV2Service", () => {
    it("reserves first and signs only its database-derived amount and creation time", async () => {
        const reserve = vi.fn().mockResolvedValue({
            kind: "created",
            paymentId: serializeEntityId("42"),
            merchantReference: "vnpay:42:key-a",
            amount: serializeMoney("12345.0000"),
            status: "pending",
            createdAt: new Date("2026-09-25T00:00:00.000Z"),
        });
        const createPaymentUrl = vi.fn().mockReturnValue({
            url: "https://pay.example.test/?signed=yes",
            transactionReference: "V242",
            expiresAt: "2026-09-25T00:15:00.000Z",
        });
        const service = new VnPayPaymentRequestV2Service({
            attempts: { reserve },
            gateway: { createPaymentUrl },
        });

        await expect(service.create(context, {
            orderId: "99",
            requestKey: "payment-key-a",
            clientIp: "203.0.113.7",
            locale: "en",
            bankCode: "NCB",
        })).resolves.toEqual({
            kind: "redirect",
            paymentId: "42",
            merchantReference: "vnpay:42:key-a",
            amount: "12345.0000",
            paymentUrl: "https://pay.example.test/?signed=yes",
            transactionReference: "V242",
            expiresAt: "2026-09-25T00:15:00.000Z",
        });
        expect(reserve).toHaveBeenCalledWith(context, { orderId: "99", requestKey: "payment-key-a" });
        expect(createPaymentUrl).toHaveBeenCalledWith({
            paymentId: "42",
            amount: "12345.0000",
            createdAt: new Date("2026-09-25T00:00:00.000Z"),
            clientIp: "203.0.113.7",
            locale: "en",
            bankCode: "NCB",
        });
    });

    it("rejects malformed browser options before reserving a payment and never reopens a completed attempt", async () => {
        const reserve = vi.fn().mockResolvedValue({
            kind: "replayed",
            paymentId: serializeEntityId("42"),
            merchantReference: "vnpay:42:key-a",
            amount: serializeMoney("12345.0000"),
            status: "completed",
            createdAt: new Date("2026-09-25T00:00:00.000Z"),
        });
        const createPaymentUrl = vi.fn();
        const service = new VnPayPaymentRequestV2Service({ attempts: { reserve }, gateway: { createPaymentUrl } });

        await expect(service.create(context, {
            orderId: "99", requestKey: "payment-key-a", clientIp: "not-an-ip",
        })).resolves.toEqual({ kind: "invalid_request" });
        expect(reserve).not.toHaveBeenCalled();

        await expect(service.create(context, {
            orderId: "99", requestKey: "payment-key-a", clientIp: "203.0.113.7",
        })).resolves.toEqual({ kind: "payment_in_progress" });
        expect(createPaymentUrl).not.toHaveBeenCalled();
    });
});
