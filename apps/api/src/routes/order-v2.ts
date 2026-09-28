import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { OrderCheckoutV2Service } from "../modules/commerce/application/order-checkout-v2.service.js";
import { OrderCancellationV2Service } from "../modules/commerce/application/order-cancellation-v2.service.js";
import { OrderConfirmationV2Service } from "../modules/commerce/application/order-confirmation-v2.service.js";
import { OrderQueryV2Service } from "../modules/commerce/application/order-query-v2.service.js";
import { PosCashCheckoutV2Service } from "../modules/commerce/application/pos-cash-checkout-v2.service.js";
import { VoucherDirectoryV2Service } from "../modules/commerce/application/voucher-directory-v2.service.js";
import { createOnlinePickupCheckoutV2Router } from "../modules/commerce/interfaces/http/online-pickup-checkout-v2.routes.js";
import { createOrderLifecycleV2Router } from "../modules/commerce/interfaces/http/order-lifecycle-v2.routes.js";
import { createOrderReadV2Router } from "../modules/commerce/interfaces/http/order-read-v2.routes.js";
import { createPosCashCheckoutV2Router } from "../modules/commerce/interfaces/http/pos-cash-checkout-v2.routes.js";
import { createVoucherDirectoryV2Router } from "../modules/commerce/interfaces/http/voucher-directory-v2.routes.js";
import { SequelizeOrderCheckoutV2Repository } from "../modules/commerce/persistence/order-checkout-v2.repository.js";
import { SequelizeOrderCancellationV2Repository } from "../modules/commerce/persistence/order-cancellation-v2.repository.js";
import { SequelizeOrderConfirmationV2Repository } from "../modules/commerce/persistence/order-confirmation-v2.repository.js";
import { SequelizeOrderQueryV2Repository } from "../modules/commerce/persistence/order-query-v2.repository.js";
import { SequelizePosCashCheckoutV2Repository } from "../modules/commerce/persistence/pos-cash-checkout-v2.repository.js";
import { SequelizeVoucherDirectoryV2Repository } from "../modules/commerce/persistence/voucher-directory-v2.repository.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";

/** V2-only composition. The legacy app does not mount this before the cutover. */
export const createOrderV2Router = (persistence: V2Persistence): Router => {
    const router = Router();
    const auth = createV2AuthMiddleware({
        accessContexts: new SequelizeV2AccessContextRepository(persistence),
    });
    router.use(createVoucherDirectoryV2Router(new VoucherDirectoryV2Service(
        new SequelizeVoucherDirectoryV2Repository(persistence),
    )));
    router.use(createOrderReadV2Router({ auth,
        query: new OrderQueryV2Service({ repository: new SequelizeOrderQueryV2Repository(persistence) }) }));
    router.use(createOnlinePickupCheckoutV2Router({ auth,
        checkout: new OrderCheckoutV2Service({
            repository: new SequelizeOrderCheckoutV2Repository(persistence),
        }) }));
    router.use(createOrderLifecycleV2Router({ auth,
        confirmation: new OrderConfirmationV2Service({
            repository: new SequelizeOrderConfirmationV2Repository(persistence),
        }),
        cancellation: new OrderCancellationV2Service({
            repository: new SequelizeOrderCancellationV2Repository(persistence),
        }),
    }));
    router.use(createPosCashCheckoutV2Router({ auth,
        checkout: new PosCashCheckoutV2Service({
            repository: new SequelizePosCashCheckoutV2Repository(persistence),
        }) }));
    return router;
};
