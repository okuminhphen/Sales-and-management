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
import { CatalogProductCommandV2Service } from "../modules/catalog/application/catalog-product-command-v2.service.js";
import { SequelizeCatalogProductCommandV2Repository } from "../modules/catalog/persistence/catalog-product-command-v2.repository.js";
import { createCatalogProductCommandV2Router } from "../modules/catalog/interfaces/http/catalog-product-command-v2.routes.js";
import { CatalogVariantCommandV2Service } from "../modules/catalog/application/catalog-variant-command-v2.service.js";
import { SequelizeCatalogVariantCommandV2Repository } from "../modules/catalog/persistence/catalog-variant-command-v2.repository.js";
import { createCatalogVariantCommandV2Router } from "../modules/catalog/interfaces/http/catalog-variant-command-v2.routes.js";
import { CatalogProductMediaV2Service } from "../modules/catalog/application/catalog-product-media-v2.service.js";
import { SequelizeCatalogProductMediaV2Repository } from "../modules/catalog/persistence/catalog-product-media-v2.repository.js";
import { createCatalogProductMediaV2Router } from "../modules/catalog/interfaces/http/catalog-product-media-v2.routes.js";
import { CloudinaryCatalogMediaProvider } from "../modules/catalog/infrastructure/cloudinary-catalog-media.provider.js";
import type { CatalogMediaProvider } from "../modules/catalog/application/catalog-media-provider.js";

/** Standalone T27 composition; legacy app mounting waits for T38-T44 cutover. */
export const createCatalogV2Router = (dependencies: {
    persistence: V2Persistence;
    audit?: V2HttpAuditWriter;
    mediaProvider?: CatalogMediaProvider;
}): Router => {
    const { persistence } = dependencies;
    if (!dependencies.mediaProvider && (!process.env.CLOUDINARY_CLOUD_NAME?.trim()
        || !process.env.CLOUDINARY_API_KEY?.trim() || !process.env.CLOUDINARY_API_SECRET?.trim())) {
        throw new Error("Cloudinary credentials are required for V2 product media.");
    }
    const mediaProvider = dependencies.mediaProvider ?? new CloudinaryCatalogMediaProvider();
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
    router.use(createCatalogProductCommandV2Router({
        auth,
        command: new CatalogProductCommandV2Service({ repository: new SequelizeCatalogProductCommandV2Repository(persistence) }),
        audit: dependencies.audit,
    }));
    router.use(createCatalogVariantCommandV2Router({
        auth,
        command: new CatalogVariantCommandV2Service({ repository: new SequelizeCatalogVariantCommandV2Repository(persistence) }),
        audit: dependencies.audit,
    }));
    router.use(createCatalogProductMediaV2Router({
        auth,
        command: new CatalogProductMediaV2Service({
            repository: new SequelizeCatalogProductMediaV2Repository(persistence), mediaProvider,
        }),
        audit: dependencies.audit,
    }));
    return router;
};
