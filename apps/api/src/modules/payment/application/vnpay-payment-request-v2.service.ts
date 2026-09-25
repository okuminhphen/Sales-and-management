import { isIP } from "node:net";
import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import type { VnPayGatewayPort } from "./vnpay-gateway.port.js";
import type { VnPayAttemptV2CommandResult } from "./vnpay-attempt-v2.service.js";

type VnPayAttemptReserver = {
    reserve: (context: V2AccessContext, input: { orderId: unknown; requestKey: unknown }) => Promise<VnPayAttemptV2CommandResult>;
};

export type VnPayPaymentRequestResult = {
    kind: "forbidden" | "order_not_payable" | "payment_in_progress" | "payment_unavailable"
        | "invalid_attempt" | "invalid_request";
}
    | {
        kind: "redirect";
        paymentId: string;
        merchantReference: string;
        amount: string;
        paymentUrl: string;
        transactionReference: string;
        expiresAt: string;
    };

/** Creates a redirect only from a persisted attempt; browser input never determines its amount. */
export class VnPayPaymentRequestV2Service {
    constructor(private readonly dependencies: {
        attempts: VnPayAttemptReserver;
        gateway: Pick<VnPayGatewayPort, "createPaymentUrl">;
    }) {}

    async create(context: V2AccessContext, input: {
        orderId: unknown;
        requestKey: unknown;
        clientIp: unknown;
        locale?: unknown;
        bankCode?: unknown;
    }): Promise<VnPayPaymentRequestResult> {
        if (typeof input.clientIp !== "string" || isIP(input.clientIp) === 0
            || (input.locale !== undefined && input.locale !== "vn" && input.locale !== "en")
            || (input.bankCode !== undefined && (typeof input.bankCode !== "string"
                || !/^[A-Za-z0-9]{3,20}$/.test(input.bankCode)))) {
            return { kind: "invalid_request" };
        }
        const attempt = await this.dependencies.attempts.reserve(context, {
            orderId: input.orderId,
            requestKey: input.requestKey,
        });
        if ("paymentId" in attempt) {
            if (attempt.status !== "pending") return { kind: "payment_in_progress" };
            const locale = input.locale === "vn" || input.locale === "en" ? input.locale : undefined;
            const bankCode = typeof input.bankCode === "string" ? input.bankCode : undefined;
            try {
                const redirect = this.dependencies.gateway.createPaymentUrl({
                    paymentId: attempt.paymentId,
                    amount: attempt.amount,
                    createdAt: attempt.createdAt,
                    clientIp: input.clientIp,
                    locale,
                    bankCode,
                });
                return { kind: "redirect", paymentId: attempt.paymentId,
                    merchantReference: attempt.merchantReference, amount: attempt.amount,
                    paymentUrl: redirect.url, transactionReference: redirect.transactionReference,
                    expiresAt: redirect.expiresAt };
            } catch {
                return { kind: "payment_unavailable" };
            }
        }
        return attempt;
    }
}
