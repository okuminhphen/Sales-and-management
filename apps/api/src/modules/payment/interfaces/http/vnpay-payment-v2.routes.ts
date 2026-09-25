import { Router, type RequestHandler } from "express";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import type { VnPayPaymentCallbackV2Service } from "../../application/vnpay-payment-callback-v2.service.js";
import type { VnPayPaymentRequestV2Service } from "../../application/vnpay-payment-request-v2.service.js";
import type { VnPayPaymentReturnV2Service } from "../../application/vnpay-payment-return-v2.service.js";
import { createVnPayPaymentV2Controller } from "./vnpay-payment-v2.controller.js";
import { createVnPayPaymentBodyV2 } from "./vnpay-payment-v2.dto.js";

/**
 * V2-compatible VNPay routes. This factory is intentionally not mounted until
 * the payment cutover: no live traffic changes while its contract is verified.
 */
export const createVnPayPaymentV2Router = (dependencies: {
    auth: RequestHandler;
    requests: VnPayPaymentRequestV2Service;
    returns: VnPayPaymentReturnV2Service;
    callbacks: VnPayPaymentCallbackV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    const controller = createVnPayPaymentV2Controller(dependencies);
    router.post("/create-payment-url", createV2HttpAudit("payment.vnpay.create_url", dependencies.audit),
        dependencies.auth, validateRequest({ body: createVnPayPaymentBodyV2 }), controller.create);
    router.get("/payment-return", controller.browserReturn);
    router.get("/vnpay/ipn", controller.ipn);
    return router;
};
