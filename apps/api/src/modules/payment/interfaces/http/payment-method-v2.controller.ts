import type { RequestHandler } from "express";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { PaymentMethodV2Service } from "../../application/payment-method-v2.service.js";

export const createPaymentMethodV2Controller = (methods: PaymentMethodV2Service): RequestHandler =>
    async (request, response) => {
        if (!(request as V2AuthenticatedRequest).v2AccessContext) {
            response.status(401).json({ EM: "Authentication required", EC: 3, DT: [] });
            return;
        }
        try {
            response.status(200).json({ EM: "Get payment methods successfully", EC: "0",
                DT: await methods.listActive() });
        } catch {
            response.status(503).json({ EM: "Payment methods unavailable", EC: "-1", DT: [] });
        }
    };
