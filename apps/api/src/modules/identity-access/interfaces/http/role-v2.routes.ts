import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { RoleManagementResult, RoleManagementV2Service } from "../../application/role-management-v2.service.js";
import type { V2AuthenticatedRequest } from "./v2-auth.middleware.js";
import { createRoleV2Body, roleIdV2Params, updateRoleV2Body } from "./role-v2.dto.js";

const send = (response: Response, result: RoleManagementResult): void => {
    switch (result.kind) {
        case "roles": response.status(200).json({ EM: "Get roles successfully", EC: 0, DT: result.roles }); return;
        case "permissions": response.status(200).json({ EM: "Get permissions successfully", EC: 0, DT: result.permissions }); return;
        case "created":
        case "updated":
            response.locals.auditResourceId = String(result.role.id);
            response.status(200).json({ EM: `${result.kind} role successfully`, EC: 0, DT: result.role }); return;
        case "deleted": response.status(200).json({ EM: "Delete role successfully", EC: 0, DT: null }); return;
        case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
        case "invalid_role_input": response.status(400).json({ EM: "Invalid role input", EC: 1, DT: null }); return;
        case "role_not_found":
        case "permission_not_found": response.status(404).json({ EM: "Role or permission not found", EC: 1, DT: null }); return;
        case "role_code_conflict":
        case "system_role_immutable":
        case "role_in_use": response.status(409).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "role_management_unavailable":
            response.status(503).json({ EM: "Role management unavailable", EC: -1, DT: null }); return;
    }
};

export const createRoleV2Router = (dependencies: {
    auth: RequestHandler;
    service: RoleManagementV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.get("/role/read", dependencies.auth, async (request, response) => {
        const context = (request as V2AuthenticatedRequest).v2AccessContext!;
        send(response, await dependencies.service.listRoles(context));
    });
    router.get("/role/permissions", dependencies.auth, async (request, response) => {
        const context = (request as V2AuthenticatedRequest).v2AccessContext!;
        send(response, await dependencies.service.listPermissions(context));
    });
    router.post("/role/create", createV2HttpAudit("role.create", dependencies.audit),
        dependencies.auth, validateRequest({ body: createRoleV2Body }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.createRole(context, request.body));
        });
    router.put("/role/update/:roleId", createV2HttpAudit("role.update", dependencies.audit),
        dependencies.auth, validateRequest({ params: roleIdV2Params, body: updateRoleV2Body }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.updateRole(context, Number(request.params.roleId), request.body));
        });
    router.delete("/role/delete/:roleId", createV2HttpAudit("role.delete", dependencies.audit),
        dependencies.auth, validateRequest({ params: roleIdV2Params }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            const result = await dependencies.service.deleteRole(context, Number(request.params.roleId));
            if (result.kind === "deleted") response.locals.auditResourceId = request.params.roleId;
            send(response, result);
        });
    return router;
};
