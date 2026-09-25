import type { RequestHandler, Response } from "express";
import type { OrderCancellationCommandResult, OrderCancellationV2Service } from "../../application/order-cancellation-v2.service.js";
import type { OrderConfirmationCommandResult, OrderConfirmationV2Service } from "../../application/order-confirmation-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

type ConfirmationHandler = Pick<OrderConfirmationV2Service, "confirm">;
type CancellationHandler = Pick<OrderCancellationV2Service, "cancel">;

const contextOf = (request: Parameters<RequestHandler>[0]) =>
    (request as V2AuthenticatedRequest).v2AccessContext;

const reject = (response: Response, status: number, message: string, code: "1" | "3" | "-1"): void => {
    response.status(status).json({ EM: message, EC: code, DT: null });
};

const sendConfirmation = (response: Response, result: OrderConfirmationCommandResult): void => {
    switch (result.kind) {
        case "confirmed":
        case "replayed":
            response.locals.auditResourceId = result.orderId;
            response.status(200).json({ EM: "Update order status successfully", EC: "0", DT: { orderId: result.orderId } });
            return;
        case "forbidden": reject(response, 403, "Order access denied", "3"); return;
        case "invalid_order": reject(response, 400, "Invalid order", "1"); return;
        case "order_not_found": reject(response, 404, "Order not found", "1"); return;
        case "order_not_pending":
        case "payment_not_settled":
        case "reservation_expired":
            reject(response, 409, "Order cannot be confirmed", "1"); return;
        case "confirmation_unavailable": reject(response, 503, "Order confirmation unavailable", "-1"); return;
    }
};

const sendCancellation = (response: Response, result: OrderCancellationCommandResult): void => {
    switch (result.kind) {
        case "cancelled":
        case "replayed":
            response.locals.auditResourceId = result.orderId;
            response.status(200).json({ EM: "Update order status successfully", EC: "0", DT: { orderId: result.orderId } });
            return;
        case "forbidden": reject(response, 403, "Order access denied", "3"); return;
        case "invalid_order":
        case "invalid_reason": reject(response, 400, "Invalid order cancellation", "1"); return;
        case "order_not_found": reject(response, 404, "Order not found", "1"); return;
        case "order_not_cancellable":
        case "payment_unresolved": reject(response, 409, "Order cannot be cancelled", "1"); return;
        case "cancellation_unavailable": reject(response, 503, "Order cancellation unavailable", "-1"); return;
    }
};

export const createOrderConfirmationV2Controller = (confirmation: ConfirmationHandler): RequestHandler =>
    async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", "3");
            return;
        }
        try {
            sendConfirmation(response, await confirmation.confirm(context, request.params.orderId));
        } catch {
            reject(response, 503, "Order confirmation unavailable", "-1");
        }
    };

export const createOrderCancellationV2Controller = (cancellation: CancellationHandler): RequestHandler =>
    async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", "3");
            return;
        }
        try {
            sendCancellation(response, await cancellation.cancel(context, request.params.orderId, request.body.reason));
        } catch {
            reject(response, 503, "Order cancellation unavailable", "-1");
        }
    };
