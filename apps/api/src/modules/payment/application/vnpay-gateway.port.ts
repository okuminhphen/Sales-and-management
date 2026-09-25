import type { EntityId, Money } from "../../../shared/contracts/database-scalars.js";

export type VnPayPaymentUrlInput = {
    paymentId: EntityId;
    amount: Money;
    createdAt: Date;
    clientIp: string;
    locale?: "vn" | "en";
    bankCode?: string;
};

export type VnPayPaymentUrl = {
    url: string;
    transactionReference: string;
    expiresAt: string;
};

export type VnPayCallback =
    | { kind: "invalid"; reason: "invalid_payload" | "invalid_signature" }
    | {
        kind: "verified";
        paymentId: EntityId;
        transactionReference: string;
        amount: Money;
        providerTransactionId: string | null;
        outcome: "completed" | "failed";
        responseCode: string;
        transactionStatus: string;
        eventKey: string;
    };

/** Port for signing and verifying VNPay payloads without provider network I/O. */
export interface VnPayGatewayPort {
    createPaymentUrl: (input: VnPayPaymentUrlInput) => VnPayPaymentUrl;
    verifyCallback: (input: Readonly<Record<string, string>>) => VnPayCallback;
}
