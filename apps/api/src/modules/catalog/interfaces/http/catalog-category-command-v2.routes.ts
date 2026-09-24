import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { CatalogCategoryCommandV2Service, CategoryCommandResult } from "../../application/catalog-category-command-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import { categoryCreateBodyV2, categoryUpdateBodyV2, catalogCategoryIdParamsV2 } from "./catalog-read-v2.dto.js";

const send = (response: Response, result: CategoryCommandResult): void => {
    switch (result.kind) {
        case "created":
        case "updated":
            response.locals.auditResourceId = result.id;
            response.status(200).json({ EM: `${result.kind} category successfully`, EC: 0, DT: { id: result.id } }); return;
        case "deleted": response.status(200).json({ EM: "Deleted category successfully", EC: 0, DT: null }); return;
        case "forbidden": response.status(403).json({ EM: "Catalog permission required", EC: 3, DT: null }); return;
        case "invalid_category_input": response.status(400).json({ EM: "Invalid category input", EC: 1, DT: null }); return;
        case "category_not_found":
        case "parent_not_found": response.status(404).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "category_cycle":
        case "category_in_use": response.status(409).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "catalog_unavailable": response.status(503).json({ EM: "Catalog unavailable", EC: -1, DT: null }); return;
    }
};

export const createCatalogCategoryCommandV2Router = (dependencies: {
    auth: RequestHandler;
    command: CatalogCategoryCommandV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/category/create", createV2HttpAudit("category.create", dependencies.audit), dependencies.auth,
        validateRequest({ body: categoryCreateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.create((request as V2AuthenticatedRequest).v2AccessContext!, request.body));
        });
    router.put("/category/update/:categoryId", createV2HttpAudit("category.update", dependencies.audit), dependencies.auth,
        validateRequest({ params: catalogCategoryIdParamsV2, body: categoryUpdateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.update((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.categoryId, request.body));
        });
    router.delete("/category/delete/:categoryId", createV2HttpAudit("category.delete", dependencies.audit), dependencies.auth,
        validateRequest({ params: catalogCategoryIdParamsV2 }), async (request, response) => {
            const result = await dependencies.command.remove((request as V2AuthenticatedRequest).v2AccessContext!,
                request.params.categoryId);
            if (result.kind === "deleted") response.locals.auditResourceId = request.params.categoryId;
            send(response, result);
        });
    return router;
};
