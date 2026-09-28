import { Router } from "express";
import { env } from "../config/env.js";
import type { V2Persistence } from "../database/v2/persistence.js";
import { VnPayGatewayV2 } from "../infrastructure/payment/vnpay-gateway-v2.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import { PaymentMethodV2Service } from "../modules/payment/application/payment-method-v2.service.js";
import type { VnPayGatewayPort } from "../modules/payment/application/vnpay-gateway.port.js";
import { VnPayAttemptV2Service } from "../modules/payment/application/vnpay-attempt-v2.service.js";
import { VnPayPaymentCallbackV2Service } from "../modules/payment/application/vnpay-payment-callback-v2.service.js";
import { VnPayPaymentRequestV2Service } from "../modules/payment/application/vnpay-payment-request-v2.service.js";
import { VnPayPaymentReturnV2Service } from "../modules/payment/application/vnpay-payment-return-v2.service.js";
import { createPaymentMethodV2Router } from "../modules/payment/interfaces/http/payment-method-v2.routes.js";
import { createVnPayPaymentV2Router } from "../modules/payment/interfaces/http/vnpay-payment-v2.routes.js";
import { SequelizePaymentMethodV2Repository } from "../modules/payment/persistence/payment-method-v2.repository.js";
import { SequelizeVnPayAttemptV2Repository } from "../modules/payment/persistence/vnpay-attempt-v2.repository.js";
import { SequelizeVnPayPaymentCallbackV2Repository } from "../modules/payment/persistence/vnpay-payment-callback-v2.repository.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";

const configuredGateway = (): VnPayGatewayPort | undefined => {
    if (!env.VNP_TMN_CODE || !env.VNP_HASH_SECRET) return undefined;
    return new VnPayGatewayV2({
        tmnCode: env.VNP_TMN_CODE,
        hashSecret: env.VNP_HASH_SECRET,
        paymentUrl: env.VNP_URL,
        returnUrl: env.VNP_RETURN_URL,
    });
};

/** Payment methods always remain readable; VNPay endpoints are exposed only with a configured adapter. */
export const createPaymentV2Router = (dependencies: {
    persistence: V2Persistence;
    gateway?: VnPayGatewayPort;
    audit?: V2HttpAuditWriter;
}): Router => {
    const { persistence, audit } = dependencies;
    const auth = createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(persistence),
    });
    const router = Router();
    router.use(createPaymentMethodV2Router({
        auth,
        methods: new PaymentMethodV2Service({ repository: new SequelizePaymentMethodV2Repository(persistence) }),
    }));

    const gateway = dependencies.gateway ?? configuredGateway();
    if (!gateway) return router;
    router.use(createVnPayPaymentV2Router({
        auth,
        audit,
        requests: new VnPayPaymentRequestV2Service({
            attempts: new VnPayAttemptV2Service({
                repository: new SequelizeVnPayAttemptV2Repository(persistence),
            }),
            gateway,
        }),
        returns: new VnPayPaymentReturnV2Service({ gateway }),
        callbacks: new VnPayPaymentCallbackV2Service({
            gateway,
            repository: new SequelizeVnPayPaymentCallbackV2Repository(persistence),
        }),
    }));
    return router;
};
