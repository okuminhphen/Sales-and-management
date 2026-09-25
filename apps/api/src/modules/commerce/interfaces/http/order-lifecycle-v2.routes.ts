import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { OrderCancellationV2Service } from "../../application/order-cancellation-v2.service.js";
import type { OrderConfirmationV2Service } from "../../application/order-confirmation-v2.service.js";
import { createOrderCancellationV2Controller, createOrderConfirmationV2Controller } from "./order-lifecycle-v2.controller.js";
import { cancelOrderBodyV2, confirmOrderBodyV2, orderLifecycleParamsV2 } from "./order-lifecycle-v2.dto.js";

/** Internal pickup lifecycle actions. This V2 factory is unmounted from the live legacy runtime. */
export const createOrderLifecycleV2Router = (dependencies: {
    auth: RequestHandler;
    confirmation: Pick<OrderConfirmationV2Service, "confirm">;
    cancellation: Pick<OrderCancellationV2Service, "cancel">;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/order/:orderId/confirm", createV2HttpAudit("order.confirm", dependencies.audit), dependencies.auth,
        validateRequest({ params: orderLifecycleParamsV2, body: confirmOrderBodyV2 }),
        createOrderConfirmationV2Controller(dependencies.confirmation));
    router.post("/order/:orderId/cancel", createV2HttpAudit("order.cancel", dependencies.audit), dependencies.auth,
        validateRequest({ params: orderLifecycleParamsV2, body: cancelOrderBodyV2 }),
        createOrderCancellationV2Controller(dependencies.cancellation));
    return router;
};
