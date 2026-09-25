import { describe, expect, it } from "vitest";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";
import { VnPayGatewayV2 } from "../../src/infrastructure/payment/vnpay-gateway-v2.js";

const gateway = new VnPayGatewayV2({
    tmnCode: "DEMO1234",
    hashSecret: "unit-test-vnpay-hash-secret",
    paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    returnUrl: "https://shop.example.test/api/v1/payment-return?source=v2",
});

describe("VnPayGatewayV2", () => {
    it("creates a reproducible VND payment URL from a reserved payment, never browser price", () => {
        const result = gateway.createPaymentUrl({
            paymentId: serializeEntityId("42"),
            amount: serializeMoney("12345.0000"),
            createdAt: new Date("2026-09-25T00:00:00.000Z"),
            clientIp: "203.0.113.7",
            locale: "vn",
        });

        const url = new URL(result.url);
        expect(result).toMatchObject({ transactionReference: "V242", expiresAt: "2026-09-25T00:15:00.000Z" });
        expect(url.origin + url.pathname).toBe("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html");
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            vnp_Amount: "1234500",
            vnp_CreateDate: "20260925070000",
            vnp_ExpireDate: "20260925071500",
            vnp_OrderInfo: "Thanh toan don hang V242",
            vnp_TmnCode: "DEMO1234",
            vnp_TxnRef: "V242",
            vnp_SecureHash: "0603b4665b4eb1169cb1a65eea95f6fe8921af8017f69a29c1e372604f528067ed18a50bdde44cf5bb73b196ff917ddd6b509e90bd084535c2fc25f481c9cbf6",
        });
    });

    it("only accepts a signed callback whose merchant, amount and V2 reference are valid", () => {
        const verified = gateway.verifyCallback({
            vnp_TmnCode: "DEMO1234",
            vnp_Amount: "1234500",
            vnp_TxnRef: "V242",
            vnp_ResponseCode: "00",
            vnp_TransactionStatus: "00",
            vnp_TransactionNo: "14000001",
            vnp_PayDate: "20260925070200",
            vnp_SecureHash: "741114bde805bf1f0a90a633a3cf08a0868bbbb4f2cfeaee5badae29e9706ff66d24b8df0e52a98d2de33298ba3d85e49ddbe205f563781744b2b1c35f84c866",
        });

        expect(verified).toMatchObject({
            kind: "verified",
            paymentId: "42",
            amount: "12345.0000",
            transactionReference: "V242",
            providerTransactionId: "14000001",
            outcome: "completed",
        });

        expect(gateway.verifyCallback({
            vnp_TmnCode: "DEMO1234",
            vnp_Amount: "1234600",
            vnp_TxnRef: "V242",
            vnp_ResponseCode: "00",
            vnp_TransactionStatus: "00",
            vnp_TransactionNo: "14000001",
            vnp_PayDate: "20260925070200",
            vnp_SecureHash: "741114bde805bf1f0a90a633a3cf08a0868bbbb4f2cfeaee5badae29e9706ff66d24b8df0e52a98d2de33298ba3d85e49ddbe205f563781744b2b1c35f84c866",
        })).toEqual({ kind: "invalid", reason: "invalid_signature" });
    });

    it("rejects malformed callback data before it can mutate a payment", () => {
        expect(gateway.verifyCallback({
            vnp_TmnCode: "DEMO1234",
            vnp_Amount: "1234501",
            vnp_TxnRef: "V242",
            vnp_ResponseCode: "00",
            vnp_TransactionStatus: "00",
            vnp_TransactionNo: "14000001",
            vnp_SecureHash: "c583daf134297e3cb5614c7eee48203ba8148f435c4bdee4eba706d2911e82a5040a2d4b830fcecb1e02db30c95914e42b69cd241952b853f61b27d656b38f8a",
        })).toEqual({ kind: "invalid", reason: "invalid_payload" });
    });
});
