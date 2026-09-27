import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { createCatalogCommerceV2Router } from "./catalog-commerce-v2.js";
import { createCatalogV2Router } from "./catalog-v2.js";
import { createConversationV2Router } from "./conversation-v2.js";
import { createIdentityV2Router } from "./identity-v2.js";
import { createInventoryV2Router } from "./inventory-v2.js";
import { createNotificationV2Router } from "./notification-v2.js";
import { createOrderV2Router } from "./order-v2.js";

/**
 * The primary HTTP composition for routes whose V2 implementations are complete.
 * Missing capabilities are deliberately not proxied to legacy persistence.
 */
export const createApiV2Router = (persistence: V2Persistence): Router => {
    const router = Router();
    router.use(createIdentityV2Router({ persistence }));
    router.use(createCatalogV2Router({ persistence }));
    router.use(createCatalogCommerceV2Router({ persistence }));
    router.use(createOrderV2Router(persistence));
    router.use(createInventoryV2Router(persistence));
    router.use(createNotificationV2Router({ persistence }));
    router.use(createConversationV2Router({ persistence }));
    return router;
};
