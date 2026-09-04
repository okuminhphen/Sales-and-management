import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import paymentController from "./payment.controller.js";
import { createPaymentUrlBody, paymentWebhookBody } from "./payment.dto.js";

export const createPaymentRouter = (): Router => {
    const router = Router();

    router.get("/payment-methods", verifyToken, paymentController.readPaymentMethodsFunc);
    router.post("/create-payment-url", verifyToken, validateRequest({ body: createPaymentUrlBody }), paymentController.createPaymentUrlFunc);
    router.get("/payment-return", verifyToken, paymentController.getPaymentReturnFunc);
    router.post("/webhook", validateRequest({ body: paymentWebhookBody }), paymentController.webhookFunc);

    return router;
};
