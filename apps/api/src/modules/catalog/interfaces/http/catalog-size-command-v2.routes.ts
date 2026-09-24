import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { CatalogSizeCommandV2Service, SizeCommandResult } from "../../application/catalog-size-command-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";
import { sizeCreateBodyV2, sizeIdParamsV2, sizeUpdateBodyV2 } from "./catalog-read-v2.dto.js";

const send = (response: Response, result: SizeCommandResult): void => {
    switch (result.kind) {
        case "created":
        case "updated":
            response.locals.auditResourceId = result.id;
            response.status(200).json({ EM: `${result.kind} size successfully`, EC: 0, DT: { id: result.id } }); return;
        case "deleted": response.status(200).json({ EM: "Deleted size successfully", EC: 0, DT: null }); return;
        case "forbidden": response.status(403).json({ EM: "Catalog permission required", EC: 3, DT: null }); return;
        case "invalid_size_input": response.status(400).json({ EM: "Invalid size input", EC: 1, DT: null }); return;
        case "size_not_found": response.status(404).json({ EM: "Size not found", EC: 1, DT: null }); return;
        case "size_name_conflict":
        case "size_in_use": response.status(409).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "catalog_unavailable": response.status(503).json({ EM: "Catalog unavailable", EC: -1, DT: null }); return;
    }
};

export const createCatalogSizeCommandV2Router = (dependencies: {
    auth: RequestHandler;
    command: CatalogSizeCommandV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.post("/size/create", createV2HttpAudit("size.create", dependencies.audit), dependencies.auth,
        validateRequest({ body: sizeCreateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.create((request as V2AuthenticatedRequest).v2AccessContext!, request.body.name));
        });
    router.put("/size/update", createV2HttpAudit("size.update", dependencies.audit), dependencies.auth,
        validateRequest({ body: sizeUpdateBodyV2 }), async (request, response) => {
            send(response, await dependencies.command.update((request as V2AuthenticatedRequest).v2AccessContext!,
                request.body.id, request.body.name));
        });
    router.delete("/size/delete/:id", createV2HttpAudit("size.delete", dependencies.audit), dependencies.auth,
        validateRequest({ params: sizeIdParamsV2 }), async (request, response) => {
            const result = await dependencies.command.remove((request as V2AuthenticatedRequest).v2AccessContext!, request.params.id);
            if (result.kind === "deleted") response.locals.auditResourceId = request.params.id;
            send(response, result);
        });
    return router;
};
