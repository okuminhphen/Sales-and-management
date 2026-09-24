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

/** Standalone T27 composition; legacy app mounting waits for T38-T44 cutover. */
export const createCatalogV2Router = (dependencies: { persistence: V2Persistence }): Router => {
    const { persistence } = dependencies;
    return createCatalogReadV2Router({
        categories: new CatalogCategoryQueryV2Service({ repository: new SequelizeCatalogCategoryV2Repository(persistence) }),
        sizes: new CatalogSizeQueryV2Service({ repository: new SequelizeCatalogSizeV2Repository(persistence) }),
        products: new CatalogProductQueryV2Service({ repository: new SequelizeCatalogProductV2Repository(persistence) }),
        variants: new CatalogProductVariantQueryV2Service({ repository: new SequelizeCatalogProductVariantV2Repository(persistence) }),
    });
};
