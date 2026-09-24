import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { BranchResult, BranchV2Service } from "../../application/branch-v2.service.js";
import type { V2AuthenticatedRequest } from "./v2-auth.middleware.js";
import { assignBranchManagerV2Body, branchV2Params, branchV2Query,
    createBranchV2Body, updateBranchV2Body } from "./branch-v2.dto.js";

const send = (response: Response, result: BranchResult): void => {
    switch (result.kind) {
        case "branches": response.status(200).json({ EM: "Get branches successfully", EC: 0,
            DT: result.page.branches, pagination: {
                page: result.page.page, limit: result.page.limit,
                totalItems: result.page.totalItems, totalPages: result.page.totalPages,
            } }); return;
        case "branch": response.status(200).json({ EM: "Get branch successfully", EC: 0,
            DT: result.branch }); return;
        case "created":
        case "updated":
            response.locals.auditResourceId = result.branch.id;
            response.status(200).json({ EM: `${result.kind} branch successfully`, EC: 0,
                DT: result.branch }); return;
        case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
        case "invalid_branch_input": response.status(400).json({ EM: "Invalid branch input", EC: 1, DT: null }); return;
        case "branch_not_found": response.status(404).json({ EM: "Branch not found", EC: 1, DT: null }); return;
        case "branch_code_conflict": response.status(409).json({ EM: "Branch code already exists", EC: 1, DT: null }); return;
        case "manager_not_eligible": response.status(409).json({ EM: "Manager must be active in this branch", EC: 1, DT: null }); return;
        case "branch_unavailable": response.status(503).json({ EM: "Branch service unavailable", EC: -1, DT: null }); return;
    }
};

export const createBranchV2Router = (dependencies: {
    auth: RequestHandler;
    service: BranchV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.get("/branch/read", dependencies.auth, validateRequest({ query: branchV2Query }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.list(context, request.query));
        });
    router.get("/branch/:branchId", dependencies.auth, validateRequest({ params: branchV2Params }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.get(context, request.params.branchId as string));
        });
    router.post("/branch/create", createV2HttpAudit("branch.create", dependencies.audit),
        dependencies.auth, validateRequest({ body: createBranchV2Body }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.create(context, request.body));
        });
    router.put("/branch/update/:branchId", createV2HttpAudit("branch.update", dependencies.audit),
        dependencies.auth, validateRequest({ params: branchV2Params, body: updateBranchV2Body }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.update(context, request.params.branchId as string, request.body));
        });
    router.put("/branch/:branchId/manager", createV2HttpAudit("branch.assign_manager", dependencies.audit),
        dependencies.auth, validateRequest({ params: branchV2Params, body: assignBranchManagerV2Body }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.assignManager(context, request.params.branchId as string,
                request.body.employeeId));
        });
    return router;
};
