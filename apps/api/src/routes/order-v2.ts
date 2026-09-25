import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { OrderCheckoutV2Service } from "../modules/commerce/application/order-checkout-v2.service.js";
import { OrderQueryV2Service } from "../modules/commerce/application/order-query-v2.service.js";
import { PosCashCheckoutV2Service } from "../modules/commerce/application/pos-cash-checkout-v2.service.js";
import { createOnlinePickupCheckoutV2Router } from "../modules/commerce/interfaces/http/online-pickup-checkout-v2.routes.js";
import { createOrderReadV2Router } from "../modules/commerce/interfaces/http/order-read-v2.routes.js";
import { createPosCashCheckoutV2Router } from "../modules/commerce/interfaces/http/pos-cash-checkout-v2.routes.js";
import { SequelizeOrderCheckoutV2Repository } from "../modules/commerce/persistence/order-checkout-v2.repository.js";
import { SequelizeOrderQueryV2Repository } from "../modules/commerce/persistence/order-query-v2.repository.js";
import { SequelizePosCashCheckoutV2Repository } from "../modules/commerce/persistence/pos-cash-checkout-v2.repository.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";

/** V2-only composition. The legacy app does not mount this before the cutover. */
export const createOrderV2Router = (persistence: V2Persistence): Router => {
    const router = Router();
    const auth = createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(persistence),
    });
    router.use(createOrderReadV2Router({ auth,
        query: new OrderQueryV2Service({ repository: new SequelizeOrderQueryV2Repository(persistence) }) }));
    router.use(createOnlinePickupCheckoutV2Router({ auth,
        checkout: new OrderCheckoutV2Service({
            repository: new SequelizeOrderCheckoutV2Repository(persistence),
        }) }));
    router.use(createPosCashCheckoutV2Router({ auth,
        checkout: new PosCashCheckoutV2Service({
            repository: new SequelizePosCashCheckoutV2Repository(persistence),
        }) }));
    return router;
};
