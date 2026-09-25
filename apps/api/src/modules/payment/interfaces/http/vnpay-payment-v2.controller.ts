import type { Request, RequestHandler, Response } from "express";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { VnPayPaymentCallbackResult, VnPayPaymentCallbackV2Service } from "../../application/vnpay-payment-callback-v2.service.js";
import type { VnPayPaymentRequestV2Service } from "../../application/vnpay-payment-request-v2.service.js";
import type { VnPayPaymentReturnV2Service } from "../../application/vnpay-payment-return-v2.service.js";
import { vnpayCallbackQueryV2 } from "./vnpay-payment-v2.dto.js";

type IPNResponse = { RspCode: "00" | "01" | "02" | "04" | "97" | "99"; Message: string };

const contextOf = (request: Request) => (request as V2AuthenticatedRequest).v2AccessContext;

const callbackPayload = (request: Request): Readonly<Record<string, string>> | null => {
    const parsed = vnpayCallbackQueryV2.safeParse(request.query);
    return parsed.success ? parsed.data : null;
};

const ipnResponse = (result: VnPayPaymentCallbackResult): IPNResponse => {
    switch (result.kind) {
        case "processed": return { RspCode: "00", Message: "Confirm Success" };
        case "replayed":
        case "completed_conflict": return { RspCode: "02", Message: "Payment already confirmed" };
        case "payment_not_found":
        case "payment_mismatch": return { RspCode: "01", Message: "Order not found" };
        case "amount_mismatch": return { RspCode: "04", Message: "invalid amount" };
        case "invalid_callback": return { RspCode: "97", Message: "Invalid signature" };
        case "provider_transaction_conflict":
        case "provider_event_conflict":
        case "callback_unavailable": return { RspCode: "99", Message: "Unknown error" };
    }
};

const callbackFailure = (response: Response): void => {
    response.status(400).json({ error: {
        code: "INVALID_PAYMENT_RETURN",
        message: "Payment return could not be verified.",
    } });
};

/** HTTP adapter preserving the legacy URL-creation response while isolating V2 protocol rules. */
export const createVnPayPaymentV2Controller = (dependencies: {
    requests: VnPayPaymentRequestV2Service;
    returns: VnPayPaymentReturnV2Service;
    callbacks: VnPayPaymentCallbackV2Service;
}): { create: RequestHandler; browserReturn: RequestHandler; ipn: RequestHandler } => ({
    create: async (request, response) => {
        response.locals.auditResourceId = request.body.orderId;
        const context = contextOf(request);
        if (!context) {
            response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            return;
        }
        try {
            const result = await dependencies.requests.create(context, {
                orderId: request.body.orderId,
                requestKey: request.body.requestKey,
                clientIp: request.ip,
                locale: request.body.locale,
                bankCode: request.body.bankCode,
            });
            switch (result.kind) {
                case "redirect": response.status(200).json({ vnpUrl: result.paymentUrl }); return;
                case "forbidden": response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null }); return;
                case "order_not_payable": response.status(409).json({ EM: "Order is not payable", EC: 1, DT: null }); return;
                case "payment_in_progress": response.status(409).json({ EM: "Payment is already in progress", EC: 1, DT: null }); return;
                case "invalid_attempt":
                case "invalid_request": response.status(400).json({ EM: "Invalid payment request", EC: 1, DT: null }); return;
                case "payment_unavailable": response.status(503).json({ EM: "Payment service unavailable", EC: -1, DT: null }); return;
            }
        } catch {
            response.status(503).json({ EM: "Payment service unavailable", EC: -1, DT: null });
        }
    },
    browserReturn: (request, response) => {
        const payload = callbackPayload(request);
        if (!payload) return void callbackFailure(response);
        try {
            const result = dependencies.returns.handle(payload);
            if (result.kind === "invalid_callback") return void callbackFailure(response);
            response.status(200).json({ status: result.kind });
        } catch {
            response.status(503).json({ error: {
                code: "PAYMENT_RETURN_UNAVAILABLE",
                message: "Payment return is temporarily unavailable.",
            } });
        }
    },
    ipn: async (request, response) => {
        const payload = callbackPayload(request);
        if (!payload) {
            response.status(200).json({ RspCode: "99", Message: "Invalid request" });
            return;
        }
        try {
            response.status(200).json(ipnResponse(await dependencies.callbacks.handle(payload)));
        } catch {
            response.status(200).json({ RspCode: "99", Message: "Unknown error" });
        }
    },
});
