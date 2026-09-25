import type { RequestHandler, Response } from "express";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { OnlinePickupCommandResult, OrderCheckoutV2Service } from "../../application/order-checkout-v2.service.js";

type OnlinePickupCheckoutHandler = Pick<OrderCheckoutV2Service, "checkoutOnlinePickup">;

const contextOf = (request: Parameters<RequestHandler>[0]) =>
    (request as V2AuthenticatedRequest).v2AccessContext;

const reject = (response: Response, status: number, message: string, code: "1" | "3" | "-1"): void => {
    response.status(status).json({ EM: message, EC: code, DT: null });
};

const sendResult = (response: Response, result: OnlinePickupCommandResult): void => {
    switch (result.kind) {
        case "created":
        case "replayed":
            response.locals.auditResourceId = result.orderId;
            response.status(200).json({ EM: "Create order successfully", EC: "0", DT: { orderId: result.orderId } });
            return;
        case "forbidden": reject(response, 403, "Customer identity required", "3"); return;
        case "invalid_checkout": reject(response, 400, "Invalid pickup checkout", "1"); return;
        case "idempotency_conflict":
            reject(response, 409, "Checkout intent conflicts with an existing order", "1"); return;
        case "product_unavailable":
        case "branch_unavailable":
        case "insufficient_stock":
        case "voucher_not_eligible":
            reject(response, 409, "Checkout cannot be completed", "1"); return;
        case "checkout_unavailable": reject(response, 503, "Checkout service unavailable", "-1"); return;
    }
};

/** Adapts online pickup checkout to the legacy envelope without trusting browser money or ownership. */
export const createOnlinePickupCheckoutV2Controller = (checkout: OnlinePickupCheckoutHandler): RequestHandler =>
    async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", "3");
            return;
        }
        try {
            sendResult(response, await checkout.checkoutOnlinePickup(context, request.body));
        } catch {
            reject(response, 503, "Checkout service unavailable", "-1");
        }
    };
