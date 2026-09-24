import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { CatalogVariantCommandV2Service, VariantCommandResult } from "../../application/catalog-variant-command-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import { catalogProductIdParamsV2, variantCreateBodyV2, variantParamsV2, variantUpdateBodyV2 } from "./catalog-read-v2.dto.js";

const send = (response: Response, result: VariantCommandResult): void => {
    switch (result.kind) {
        case "created":
        case "updated":
            response.locals.auditResourceId = result.id;
            response.status(200).json({ EM: `${result.kind} variant successfully`, EC: 0, DT: { id: result.id } }); return;
        case "deactivated": response.status(200).json({ EM: "Variant deactivated successfully", EC: 0, DT: null }); return;
        case "forbidden": response.status(403).json({ EM: "Catalog permission required", EC: 3, DT: null }); return;
        case "invalid_variant_input": response.status(400).json({ EM: "Invalid variant input", EC: 1, DT: null }); return;
        case "product_not_found":
        case "size_not_found":
        case "variant_not_found": response.status(404).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "variant_conflict": response.status(409).json({ EM: "Variant already exists", EC: 1, DT: null }); return;
        case "catalog_unavailable": response.status(503).json({ EM: "Catalog unavailable", EC: -1, DT: null }); return;
    }
};

export const createCatalogVariantCommandV2Router = (dependencies: {
    auth: RequestHandler;
    command: CatalogVariantCommandV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/product/:productId/variants", createV2HttpAudit("variant.create", dependencies.audit), dependencies.auth,
        validateRequest({ params: catalogProductIdParamsV2, body: variantCreateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.create((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.productId, request.body));
        });
    router.put("/product/:productId/variants/:variantId", createV2HttpAudit("variant.update", dependencies.audit), dependencies.auth,
        validateRequest({ params: variantParamsV2, body: variantUpdateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.update((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.productId, request.params.variantId, request.body));
        });
    router.delete("/product/:productId/variants/:variantId", createV2HttpAudit("variant.deactivate", dependencies.audit), dependencies.auth,
        validateRequest({ params: variantParamsV2 }), async (request, response) => {
            const result = await dependencies.command.deactivate((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.productId, request.params.variantId);
            if (result.kind === "deactivated") response.locals.auditResourceId = request.params.variantId;
            send(response, result);
        });
    return router;
};
