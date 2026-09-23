import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import { createCatalogBannerMediaV2 } from "../modules/catalog/infrastructure/catalog-banner-v2.composition.js";
import type { CatalogMediaProvider } from "../modules/catalog/application/catalog-media-provider.js";
import type { CatalogMediaCleanupLog } from "../modules/catalog/application/catalog-media-cleanup-log.js";
import { CatalogBannerQueryV2Service } from "../modules/catalog/application/catalog-banner-query-v2.service.js";
import { CatalogBannerAdminQueryV2Service } from "../modules/catalog/application/catalog-banner-admin-query-v2.service.js";
import { SequelizeCatalogBannerV2Repository } from "../modules/catalog/persistence/catalog-banner-query-v2.repository.js";
import { createBannerV2Router } from "../modules/catalog/interfaces/http/banner-v2.routes.js";
import { CartQueryV2Service } from "../modules/commerce/application/cart-query-v2.service.js";
import { CartMutationV2Service } from "../modules/commerce/application/cart-mutation-v2.service.js";
import { SequelizeCartQueryV2Repository } from "../modules/commerce/persistence/cart-query-v2.repository.js";
import { SequelizeCartMutationV2Repository } from "../modules/commerce/persistence/cart-mutation-v2.repository.js";
import { SequelizeCartVariantV2Resolver } from "../modules/commerce/persistence/cart-variant-v2.resolver.js";
import { createCartV2Router } from "../modules/commerce/interfaces/http/cart-v2.routes.js";
import { ReviewCommandV2Service } from "../modules/review/application/review-command-v2.service.js";
import { ReviewQueryV2Service } from "../modules/review/application/review-query-v2.service.js";
import { SequelizeReviewCommandV2Repository } from "../modules/review/persistence/review-command-v2.repository.js";
import { SequelizeReviewQueryV2Repository } from "../modules/review/persistence/review-query-v2.repository.js";
import { createReviewV2Router } from "../modules/review/interfaces/http/review-v2.routes.js";

/** Composes the T28 capabilities against V2 only; the legacy app does not mount this router. */
export const createCatalogCommerceV2Router = (dependencies: {
    persistence: V2Persistence;
    mediaProvider?: CatalogMediaProvider;
    cleanupLog?: CatalogMediaCleanupLog;
    audit?: V2HttpAuditWriter;
}): Router => {
    const { persistence, audit } = dependencies;
    const auth = createV2AuthMiddleware({ accessContexts: new SequelizeV2AccessContextRepository(persistence) });
    const bannerMedia = createCatalogBannerMediaV2(persistence, dependencies);
    const banners = new SequelizeCatalogBannerV2Repository(persistence);
    const router = Router();
    router.use(createBannerV2Router({ auth, audit, command: bannerMedia.command,
        query: new CatalogBannerQueryV2Service({ repository: banners }),
        adminQuery: new CatalogBannerAdminQueryV2Service({ repository: banners }) }));
    router.use(createCartV2Router({ auth, audit,
        query: new CartQueryV2Service({ repository: new SequelizeCartQueryV2Repository(persistence) }),
        mutation: new CartMutationV2Service({ repository: new SequelizeCartMutationV2Repository(persistence) }),
        variants: new SequelizeCartVariantV2Resolver(persistence) }));
    router.use(createReviewV2Router({ auth, audit,
        command: new ReviewCommandV2Service({ repository: new SequelizeReviewCommandV2Repository(persistence) }),
        query: new ReviewQueryV2Service({ repository: new SequelizeReviewQueryV2Repository(persistence) }) }));
    return router;
};
