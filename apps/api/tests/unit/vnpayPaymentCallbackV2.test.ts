import { describe, expect, it, vi } from "vitest";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";
import { VnPayPaymentCallbackV2Service } from "../../src/modules/payment/application/vnpay-payment-callback-v2.service.js";

describe("VnPayPaymentCallbackV2Service", () => {
    it("never invokes persistence when gateway verification fails", async () => {
        const apply = vi.fn();
        const service = new VnPayPaymentCallbackV2Service({
            gateway: { verifyCallback: () => ({ kind: "invalid", reason: "invalid_signature" }) },
            repository: { apply },
        });

        await expect(service.handle({ vnp_SecureHash: "forged" })).resolves.toEqual({ kind: "invalid_callback" });
        expect(apply).not.toHaveBeenCalled();
    });

    it("passes only a verified callback to the repository and maps its safe result", async () => {
        const verified = {
            kind: "verified" as const,
            paymentId: serializeEntityId("42"),
            transactionReference: "V242",
            amount: serializeMoney("100.0000"),
            providerTransactionId: "7001",
            outcome: "completed" as const,
            responseCode: "00",
            transactionStatus: "00",
            eventKey: "vnpay:V242:7001",
        };
        const apply = vi.fn().mockResolvedValue({ kind: "processed", paymentId: "42", status: "completed" });
        const service = new VnPayPaymentCallbackV2Service({
            gateway: { verifyCallback: () => verified },
            repository: { apply },
        });

        await expect(service.handle({ vnp_SecureHash: "verified-by-adapter" })).resolves.toEqual({
            kind: "processed", paymentId: "42", status: "completed",
        });
        expect(apply).toHaveBeenCalledWith(verified);
    });
});
