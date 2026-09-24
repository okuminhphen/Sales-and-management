import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { CatalogProductCommandV2Service, ProductCommandResult } from "../../application/catalog-product-command-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import { productCreateBodyV2, productDeleteBodyV2, productUpdateBodyV2, productUpdateParamsV2 } from "./catalog-read-v2.dto.js";

const send = (response: Response, result: ProductCommandResult): void => {
    switch (result.kind) {
        case "created":
        case "updated":
            response.locals.auditResourceId = result.id;
            response.status(200).json({ EM: `${result.kind} product successfully`, EC: 0, DT: { id: result.id } }); return;
        case "deactivated": response.status(200).json({ EM: "Product deactivated successfully", EC: 0, DT: null }); return;
        case "forbidden": response.status(403).json({ EM: "Catalog permission required", EC: 3, DT: null }); return;
        case "invalid_product_input": response.status(400).json({ EM: "Invalid product input", EC: 1, DT: null }); return;
        case "product_not_found":
        case "category_not_found": response.status(404).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "catalog_unavailable": response.status(503).json({ EM: "Catalog unavailable", EC: -1, DT: null }); return;
    }
};

export const createCatalogProductCommandV2Router = (dependencies: {
    auth: RequestHandler;
    command: CatalogProductCommandV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/product/create", createV2HttpAudit("product.create", dependencies.audit), dependencies.auth,
        validateRequest({ body: productCreateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.create((request as V2AuthenticatedRequest).v2AccessContext!, request.body));
        });
    router.put("/product/update/:id", createV2HttpAudit("product.update", dependencies.audit), dependencies.auth,
        validateRequest({ params: productUpdateParamsV2, body: productUpdateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.update((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.id, request.body));
        });
    router.delete("/product/delete", createV2HttpAudit("product.deactivate", dependencies.audit), dependencies.auth,
        validateRequest({ body: productDeleteBodyV2 }), async (request, response) => {
            const result = await dependencies.command.deactivate((request as V2AuthenticatedRequest).v2AccessContext!,
                request.body.id);
            if (result.kind === "deactivated") response.locals.auditResourceId = request.body.id;
            send(response, result);
        });
    return router;
};
