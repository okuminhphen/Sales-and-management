import { Router, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import type { CatalogCategoryQueryV2Service } from "../../application/catalog-category-query-v2.service.js";
import type { CatalogSizeQueryV2Service } from "../../application/catalog-size-query-v2.service.js";
import type { CatalogProductQueryV2Service } from "../../application/catalog-product-query-v2.service.js";
import type { CatalogProductVariantQueryV2Service } from "../../application/catalog-product-variant-query-v2.service.js";
import { catalogListQueryV2, catalogProductIdParamsV2 } from "./catalog-read-v2.dto.js";

type Dependencies = {
    categories: CatalogCategoryQueryV2Service;
    sizes: CatalogSizeQueryV2Service;
    products: CatalogProductQueryV2Service;
    variants: CatalogProductVariantQueryV2Service;
};

const unavailable = (response: Response): void => {
    response.status(503).json({ EM: "Catalog unavailable", EC: -1, DT: null });
};

/** Public V2 read endpoints. Inventory availability is deliberately excluded. */
export const createCatalogReadV2Router = (services: Dependencies): Router => {
    const router = Router();
    router.get("/category/read", validateRequest({ query: catalogListQueryV2 }), async (request, response) => {
        const result = await services.categories.list(request.query);
        if (result.kind === "catalog_unavailable") { unavailable(response); return; }
        if (result.kind === "invalid_catalog_query") { response.status(400).json({ EM: "Invalid catalog query", EC: 1, DT: null }); return; }
        const { categories, ...pagination } = result.page;
        response.status(200).json({ EM: "Get categories successfully", EC: 0, DT: categories, pagination });
    });
    router.get("/size/read", validateRequest({ query: catalogListQueryV2 }), async (request, response) => {
        const result = await services.sizes.list(request.query);
        if (result.kind === "catalog_unavailable") { unavailable(response); return; }
        if (result.kind === "invalid_catalog_query") { response.status(400).json({ EM: "Invalid catalog query", EC: 1, DT: null }); return; }
        const { sizes, ...pagination } = result.page;
        response.status(200).json({ EM: "Get sizes successfully", EC: 0, DT: sizes, pagination });
    });
    router.get("/product/read", validateRequest({ query: catalogListQueryV2 }), async (request, response) => {
        const result = await services.products.list(request.query);
        if (result.kind === "catalog_unavailable") { unavailable(response); return; }
        if (result.kind === "invalid_product_query") { response.status(400).json({ EM: "Invalid product query", EC: 1, DT: null }); return; }
        if (result.kind !== "products") { unavailable(response); return; }
        const { products, ...pagination } = result.page;
        response.status(200).json({ EM: "Get products successfully", EC: 0, DT: products, pagination });
    });
    router.get("/product/:productId/variants", validateRequest({ params: catalogProductIdParamsV2 }), async (request, response) => {
        const result = await services.variants.listByProductId(request.params.productId);
        if (result.kind === "catalog_unavailable") { unavailable(response); return; }
        if (result.kind === "invalid_product_query") { response.status(400).json({ EM: "Invalid product ID", EC: 1, DT: null }); return; }
        if (result.kind === "product_not_found") { response.status(404).json({ EM: "Product not found", EC: 1, DT: null }); return; }
        response.status(200).json({ EM: "Get variants successfully", EC: 0, DT: result.variants });
    });
    router.get("/product/:productId", validateRequest({ params: catalogProductIdParamsV2 }), async (request, response) => {
        const result = await services.products.getById(request.params.productId);
        if (result.kind === "catalog_unavailable") { unavailable(response); return; }
        if (result.kind === "invalid_product_query") { response.status(400).json({ EM: "Invalid product ID", EC: 1, DT: null }); return; }
        if (result.kind === "product_not_found") { response.status(404).json({ EM: "Product not found", EC: 1, DT: null }); return; }
        if (result.kind !== "product") { unavailable(response); return; }
        response.status(200).json({ EM: "Get product successfully", EC: 0, DT: result.product });
    });
    return router;
};
