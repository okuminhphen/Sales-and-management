import { Router, type ErrorRequestHandler, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import { hasGlobalPermission } from "../../../identity-access/application/access-context.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import type { CatalogProductMediaV2Service, ProductMediaResult } from "../../application/catalog-product-media-v2.service.js";
import { BANNER_IMAGE_MIME_TYPES, MAX_BANNER_IMAGE_BYTES, MAX_PRODUCT_IMAGES } from "../../application/catalog-media-provider.js";
import { catalogProductIdParamsV2 } from "./catalog-read-v2.dto.js";

const requireManager: RequestHandler = (request, response, next) => {
    const context = (request as V2AuthenticatedRequest).v2AccessContext;
    if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
    if (!hasGlobalPermission(context, "catalog.manage.global")) {
        response.status(403).json({ EM: "Catalog permission required", EC: 3, DT: null }); return;
    }
    next();
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BANNER_IMAGE_BYTES, files: MAX_PRODUCT_IMAGES, fields: 0, parts: MAX_PRODUCT_IMAGES },
    fileFilter: (_request, file, callback) => {
        if (!BANNER_IMAGE_MIME_TYPES.has(file.mimetype)) { callback(new Error("Unsupported product image format")); return; }
        callback(null, true);
    },
}).array("images", MAX_PRODUCT_IMAGES);

const boundedImages: RequestHandler = (request, response, next) => {
    upload(request, response, (error: unknown) => {
        if (!error) { next(); return; }
        const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
        response.status(tooLarge ? 413 : 400).json({
            EM: tooLarge ? "Product image exceeds 5 MiB" : "Invalid product images", EC: 1, DT: null,
        });
    });
};

const send = (response: Response, result: ProductMediaResult): void => {
    switch (result.kind) {
        case "updated": response.status(200).json({ EM: "Product images saved", EC: 0, DT: null }); return;
        case "product_not_found": response.status(404).json({ EM: "Product not found", EC: 1, DT: null }); return;
        case "forbidden": response.status(403).json({ EM: "Catalog permission required", EC: 3, DT: null }); return;
        case "invalid_product_input":
        case "invalid_media": response.status(result.kind === "invalid_media" && result.reason === "file_too_large" ? 413 : 400)
            .json({ EM: "Invalid product images", EC: 1, DT: null }); return;
        case "media_unavailable":
        case "catalog_unavailable": response.status(503).json({ EM: "Product media unavailable", EC: -1, DT: null }); return;
    }
};
const handle = (handler: (request: Request, response: Response) => Promise<void>): RequestHandler =>
    (request, response, next) => { void handler(request, response).catch(next); };

export const createCatalogProductMediaV2Router = (dependencies: {
    auth: RequestHandler;
    command: CatalogProductMediaV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.put("/product/:productId/images", createV2HttpAudit("product.images.replace", dependencies.audit),
        dependencies.auth, requireManager, validateRequest({ params: catalogProductIdParamsV2 }), boundedImages,
        handle(async (request, response) => {
            response.locals.auditResourceId = request.params.productId;
            const files = Array.isArray(request.files) ? request.files : [];
            send(response, await dependencies.command.replace((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.productId, files));
        }));
    router.delete("/product/:productId/images", createV2HttpAudit("product.images.clear", dependencies.audit),
        dependencies.auth, requireManager, validateRequest({ params: catalogProductIdParamsV2 }),
        handle(async (request, response) => {
            response.locals.auditResourceId = request.params.productId;
            send(response, await dependencies.command.clear((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.productId));
        }));
    const onError: ErrorRequestHandler = (error, _request, response, next) => {
        if (response.headersSent) { next(error); return; }
        response.status(503).json({ EM: "Product media unavailable", EC: -1, DT: null });
    };
    router.use(onError);
    return router;
};
