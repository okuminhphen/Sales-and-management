import { Router, type RequestHandler } from "express";
import type { PaymentMethodV2Service } from "../../application/payment-method-v2.service.js";
import { createPaymentMethodV2Controller } from "./payment-method-v2.controller.js";

/** Legacy path/envelope against V2; mounted only at the cutover checkpoint. */
export const createPaymentMethodV2Router = (dependencies: {
    auth: RequestHandler;
    methods: PaymentMethodV2Service;
}): Router => {
    const router = Router();
    router.get("/payment-methods", dependencies.auth, createPaymentMethodV2Controller(dependencies.methods));
    return router;
};
