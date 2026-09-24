import { Router } from "express";
import type { V2Persistence } from "../database/v2/persistence.js";
import { CatalogCategoryQueryV2Service } from "../modules/catalog/application/catalog-category-query-v2.service.js";
import { CatalogSizeQueryV2Service } from "../modules/catalog/application/catalog-size-query-v2.service.js";
import { CatalogProductQueryV2Service } from "../modules/catalog/application/catalog-product-query-v2.service.js";
import { CatalogProductVariantQueryV2Service } from "../modules/catalog/application/catalog-product-variant-query-v2.service.js";
import { SequelizeCatalogCategoryV2Repository } from "../modules/catalog/persistence/catalog-category-query-v2.repository.js";
import { SequelizeCatalogSizeV2Repository } from "../modules/catalog/persistence/catalog-size-query-v2.repository.js";
import { SequelizeCatalogProductV2Repository } from "../modules/catalog/persistence/catalog-product-query-v2.repository.js";
import { SequelizeCatalogProductVariantV2Repository } from "../modules/catalog/persistence/catalog-product-variant-query-v2.repository.js";
import { createCatalogReadV2Router } from "../modules/catalog/interfaces/http/catalog-read-v2.routes.js";
import { CatalogCategoryCommandV2Service } from "../modules/catalog/application/catalog-category-command-v2.service.js";
import { SequelizeCatalogCategoryCommandV2Repository } from "../modules/catalog/persistence/catalog-category-command-v2.repository.js";
import { createCatalogCategoryCommandV2Router } from "../modules/catalog/interfaces/http/catalog-category-command-v2.routes.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";
import { CatalogSizeCommandV2Service } from "../modules/catalog/application/catalog-size-command-v2.service.js";
import { SequelizeCatalogSizeCommandV2Repository } from "../modules/catalog/persistence/catalog-size-command-v2.repository.js";
import { createCatalogSizeCommandV2Router } from "../modules/catalog/interfaces/http/catalog-size-command-v2.routes.js";

/** Standalone T27 composition; legacy app mounting waits for T38-T44 cutover. */
export const createCatalogV2Router = (dependencies: { persistence: V2Persistence; audit?: V2HttpAuditWriter }): Router => {
    const { persistence } = dependencies;
    const router = Router();
    const auth = createV2AuthMiddleware({ accessContexts: new SequelizeV2AccessContextRepository(persistence) });
    router.use(createCatalogReadV2Router({
        categories: new CatalogCategoryQueryV2Service({ repository: new SequelizeCatalogCategoryV2Repository(persistence) }),
        sizes: new CatalogSizeQueryV2Service({ repository: new SequelizeCatalogSizeV2Repository(persistence) }),
        products: new CatalogProductQueryV2Service({ repository: new SequelizeCatalogProductV2Repository(persistence) }),
        variants: new CatalogProductVariantQueryV2Service({ repository: new SequelizeCatalogProductVariantV2Repository(persistence) }),
    }));
    router.use(createCatalogCategoryCommandV2Router({
        auth,
        command: new CatalogCategoryCommandV2Service({ repository: new SequelizeCatalogCategoryCommandV2Repository(persistence) }),
        audit: dependencies.audit,
    }));
    router.use(createCatalogSizeCommandV2Router({
        auth,
        command: new CatalogSizeCommandV2Service({ repository: new SequelizeCatalogSizeCommandV2Repository(persistence) }),
        audit: dependencies.audit,
    }));
    return router;
};
