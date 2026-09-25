import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { PosCashCheckoutV2Service } from "../../application/pos-cash-checkout-v2.service.js";
import { createPosCashCheckoutV2Controller } from "./pos-cash-checkout-v2.controller.js";
import { posCashCheckoutBodyV2 } from "./pos-cash-checkout-v2.dto.js";

/**
 * V2-compatible POS cash route. It keeps the legacy path but remains unmounted
 * from the live API until the Database V2 cutover checkpoint.
 */
export const createPosCashCheckoutV2Router = (dependencies: {
    auth: RequestHandler;
    checkout: Pick<PosCashCheckoutV2Service, "checkoutCashCarryOut">;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/order/in-store", createV2HttpAudit("order.pos_cash.checkout", dependencies.audit),
        dependencies.auth, validateRequest({ body: posCashCheckoutBodyV2 }),
        createPosCashCheckoutV2Controller(dependencies.checkout));
    return router;
};
