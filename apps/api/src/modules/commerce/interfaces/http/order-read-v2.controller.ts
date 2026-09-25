import type { RequestHandler, Response } from "express";
import type { OrderListV2Result, OrderQueryV2Service, OrderSummary } from "../../application/order-query-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { OrderReadDtoV2 } from "./order-read-v2.dto.js";

const displayOrder = (order: OrderSummary): OrderReadDtoV2 => ({
    id: order.id, code: order.code, customerId: order.customerId,
    branchId: order.fulfillmentBranchId, channel: order.channel,
    fulfillmentType: order.fulfillmentType, fulfillmentStatus: order.fulfillmentStatus,
    orderDate: order.placedAt, totalPrice: order.totalAmount,
    subtotalAmount: order.subtotalAmount, discountAmount: order.discountAmount,
    shippingFee: order.shippingFee, status: order.status.toUpperCase(),
    customerName: order.customerName, customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    ordersDetails: order.items.map((item) => ({
        id: item.id, orderId: order.id, skuSnapshot: item.skuSnapshot,
        productName: item.productNameSnapshot, productSize: item.sizeNameSnapshot,
        quantity: item.quantity, priceAtOrder: item.unitPrice,
        discountAmount: item.discountAmount, totalPrice: item.lineTotal,
    })),
});

const sendList = (response: Response, result: OrderListV2Result): void => {
    switch (result.kind) {
        case "orders":
            response.status(200).json({ EM: "Get orders successfully", EC: 0,
                DT: result.page.orders.map(displayOrder),
                pagination: { page: result.page.page, limit: result.page.limit,
                    totalItems: result.page.totalItems,
                    totalPages: Math.ceil(result.page.totalItems / result.page.limit) } });
            return;
        case "forbidden": response.status(403).json({ EM: "Order access denied", EC: 3, DT: [] }); return;
        case "invalid_order": response.status(400).json({ EM: "Invalid order query", EC: 1, DT: [] }); return;
        case "order_unavailable": response.status(503).json({ EM: "Order service unavailable", EC: -1, DT: [] }); return;
    }
};

export const createOrderReadV2Controller = (query: OrderQueryV2Service): {
    own: RequestHandler; branch: RequestHandler; all: RequestHandler;
} => {
    const contextOf = (request: Parameters<RequestHandler>[0]) =>
        (request as V2AuthenticatedRequest).v2AccessContext;
    const unauthenticated = (response: Response): void => {
        response.status(401).json({ EM: "Authentication required", EC: 3, DT: [] });
    };
    return {
        own: async (request, response) => {
            const context = contextOf(request);
            if (!context) { unauthenticated(response); return; }
            // userId remains in the legacy path; ownership is derived from current DB context.
            sendList(response, await query.listOwn(context, Number(request.query.page), Number(request.query.limit)));
        },
        branch: async (request, response) => {
            const context = contextOf(request);
            if (!context) { unauthenticated(response); return; }
            sendList(response, await query.listBranch(context, request.params.branchId,
                Number(request.query.page), Number(request.query.limit)));
        },
        all: async (request, response) => {
            const context = contextOf(request);
            if (!context) { unauthenticated(response); return; }
            sendList(response, await query.listAll(context, Number(request.query.page), Number(request.query.limit)));
        },
    };
};
