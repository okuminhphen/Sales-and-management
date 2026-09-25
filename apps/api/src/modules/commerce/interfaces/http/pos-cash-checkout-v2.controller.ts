import type { RequestHandler, Response } from "express";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { PosCashCheckoutCommandResult, PosCashCheckoutV2Service } from "../../application/pos-cash-checkout-v2.service.js";

type PosCashCheckoutHandler = Pick<PosCashCheckoutV2Service, "checkoutCashCarryOut">;

const contextOf = (request: Parameters<RequestHandler>[0]) =>
    (request as V2AuthenticatedRequest).v2AccessContext;

const reject = (response: Response, status: number, message: string, code: "1" | "3" | "-1"): void => {
    response.status(status).json({ EM: message, EC: code, DT: null });
};

const sendResult = (response: Response, result: PosCashCheckoutCommandResult): void => {
    switch (result.kind) {
        case "created":
        case "replayed":
            response.locals.auditResourceId = result.orderId;
            response.status(200).json({ EM: "Create in-store order successfully", EC: "0", DT: { id: result.orderId } });
            return;
        case "forbidden": reject(response, 403, "Branch access denied", "3"); return;
        case "invalid_checkout": reject(response, 400, "Invalid in-store checkout", "1"); return;
        case "idempotency_conflict":
            reject(response, 409, "Checkout intent conflicts with an existing order", "1"); return;
        case "product_unavailable":
        case "branch_unavailable":
        case "insufficient_stock":
        case "payment_method_unavailable":
            reject(response, 409, "Checkout cannot be completed", "1"); return;
        case "checkout_unavailable": reject(response, 503, "Checkout service unavailable", "-1"); return;
    }
};

/** Adapts the V2 command to the legacy envelope without accepting money authority from the browser. */
export const createPosCashCheckoutV2Controller = (checkout: PosCashCheckoutHandler): RequestHandler =>
    async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", "3");
            return;
        }
        try {
            sendResult(response, await checkout.checkoutCashCarryOut(context, request.body));
        } catch {
            reject(response, 503, "Checkout service unavailable", "-1");
        }
    };
