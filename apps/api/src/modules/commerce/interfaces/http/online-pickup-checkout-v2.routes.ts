import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { OrderCheckoutV2Service } from "../../application/order-checkout-v2.service.js";
import { createOnlinePickupCheckoutV2Controller } from "./online-pickup-checkout-v2.controller.js";
import { onlinePickupCheckoutBodyV2 } from "./online-pickup-checkout-v2.dto.js";

/**
 * V2-compatible online pickup route. It retains the legacy path, but this
 * factory is not mounted by the live legacy runtime before the cutover gate.
 */
export const createOnlinePickupCheckoutV2Router = (dependencies: {
    auth: RequestHandler;
    checkout: Pick<OrderCheckoutV2Service, "checkoutOnlinePickup">;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/order/create", createV2HttpAudit("order.online_pickup.checkout", dependencies.audit),
        dependencies.auth, validateRequest({ body: onlinePickupCheckoutBodyV2 }),
        createOnlinePickupCheckoutV2Controller(dependencies.checkout));
    return router;
};
