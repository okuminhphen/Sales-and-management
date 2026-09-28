import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import type { CatalogMediaCleanupLog } from "../modules/catalog/application/catalog-media-cleanup-log.js";
import type { CatalogMediaProvider } from "../modules/catalog/application/catalog-media-provider.js";
import type { VnPayGatewayPort } from "../modules/payment/application/vnpay-gateway.port.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";
import { createChatbotRouter } from "../modules/chatbot/chatbot.routes.js";
import { createRecommendationProxyRouter } from "../modules/chatbot/recommendation-proxy.routes.js";
import { createAddressRouter } from "../modules/address/address.routes.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import { createCatalogCommerceV2Router } from "./catalog-commerce-v2.js";
import { createCatalogV2Router } from "./catalog-v2.js";
import { createConversationV2Router } from "./conversation-v2.js";
import { createIdentityV2Router } from "./identity-v2.js";
import { createInventoryV2Router } from "./inventory-v2.js";
import { createInventoryTransferV2Router } from "./inventory-transfer-v2.js";
import { createNotificationV2Router } from "./notification-v2.js";
import { createOrderV2Router } from "./order-v2.js";
import { createPaymentV2Router } from "./payment-v2.js";
import { createBehaviorV2Router } from "./behavior-v2.js";

/**
 * The primary HTTP composition for routes whose V2 implementations are complete.
 * Missing capabilities are deliberately not proxied to legacy persistence.
 */
export const createApiV2Router = (dependencies: {
    persistence: V2Persistence;
    mediaProvider?: CatalogMediaProvider;
    cleanupLog?: CatalogMediaCleanupLog;
    paymentGateway?: VnPayGatewayPort;
    audit?: V2HttpAuditWriter;
}): Router => {
    const { persistence, audit } = dependencies;
    const router = Router();
    router.use(createIdentityV2Router({ persistence, audit }));
    router.use(createCatalogV2Router({ persistence, audit, mediaProvider: dependencies.mediaProvider }));
    router.use(createCatalogCommerceV2Router({ persistence, audit,
        mediaProvider: dependencies.mediaProvider, cleanupLog: dependencies.cleanupLog }));
    router.use(createOrderV2Router(persistence));
    router.use(createInventoryV2Router(persistence));
    router.use(createInventoryTransferV2Router({ persistence, audit }));
    router.use(createPaymentV2Router({ persistence, audit, gateway: dependencies.paymentGateway }));
    router.use(createBehaviorV2Router({ persistence, audit }));
    router.use(createNotificationV2Router({ persistence }));
    router.use(createConversationV2Router({ persistence }));
    router.use(createChatbotRouter());
    router.use(createRecommendationProxyRouter({ auth: createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(persistence),
    }) }));
    router.use(createAddressRouter());
    return router;
};
