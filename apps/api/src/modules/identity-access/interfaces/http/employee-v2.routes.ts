import { Router, type RequestHandler, type Response } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { EmployeeResult, EmployeeV2Service } from "../../application/employee-v2.service.js";
import type { EmployeeAssignmentResult, EmployeeAssignmentV2Service } from "../../application/employee-assignment-v2.service.js";
import type { V2AuthenticatedRequest } from "./v2-auth.middleware.js";
import { createEmployeeV2Body, employeeBranchV2Params, employeeV2Params,
    employeeV2Query, linkEmployeeAccountV2Body, transferEmployeeV2Body,
    updateEmployeeV2Body } from "./employee-v2.dto.js";

const send = (response: Response, result: EmployeeResult): void => {
    switch (result.kind) {
        case "employees": response.status(200).json({ EM: "Get employees successfully", EC: 0,
            DT: result.page.employees, pagination: {
                page: result.page.page, limit: result.page.limit,
                totalItems: result.page.totalItems, totalPages: result.page.totalPages,
            } }); return;
        case "created":
        case "updated":
        case "deactivated":
            response.locals.auditResourceId = result.employee.id;
            response.status(200).json({ EM: `${result.kind} employee successfully`, EC: 0,
                DT: result.employee }); return;
        case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
        case "invalid_employee_input": response.status(400).json({ EM: "Invalid employee input", EC: 1, DT: null }); return;
        case "employee_not_found":
        case "branch_not_found":
        case "account_not_active_or_not_found":
            response.status(404).json({ EM: "Employee, branch or account not found", EC: 1, DT: null }); return;
        case "employee_code_conflict":
        case "account_already_linked":
            response.status(409).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "employee_unavailable":
            response.status(503).json({ EM: "Employee service unavailable", EC: -1, DT: null }); return;
    }
};

const sendAssignment = (response: Response, result: EmployeeAssignmentResult): void => {
    switch (result.kind) {
        case "updated":
            response.locals.auditResourceId = result.employee.id;
            response.status(200).json({ EM: "Employee assignment updated", EC: 0, DT: result.employee }); return;
        case "forbidden": response.status(403).json({ EM: "Access denied", EC: 3, DT: null }); return;
        case "invalid_input": response.status(400).json({ EM: "Invalid employee assignment", EC: 1, DT: null }); return;
        case "employee_not_found":
        case "branch_not_found":
        case "account_not_active_or_not_found":
            response.status(404).json({ EM: "Employee, branch or account not found", EC: 1, DT: null }); return;
        case "employee_not_active":
        case "same_branch":
        case "account_already_linked":
        case "account_roles_require_review":
            response.status(409).json({ EM: result.kind, EC: 1, DT: null }); return;
        case "assignment_unavailable":
            response.status(503).json({ EM: "Employee assignment unavailable", EC: -1, DT: null }); return;
    }
};

export const createEmployeeV2Router = (dependencies: {
    auth: RequestHandler;
    service: EmployeeV2Service;
    assignments: EmployeeAssignmentV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    router.get("/employee/read/:branchId", dependencies.auth, validateRequest({
        params: employeeBranchV2Params, query: employeeV2Query,
    }), async (request, response) => {
        const context = (request as V2AuthenticatedRequest).v2AccessContext!;
        send(response, await dependencies.service.listByBranch(context, request.params.branchId as string, request.query));
    });
    router.post("/employee/create", createV2HttpAudit("employee.create", dependencies.audit),
        dependencies.auth, validateRequest({ body: createEmployeeV2Body }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.create(context, request.body));
        });
    router.put("/employee/update/:employeeId", createV2HttpAudit("employee.update", dependencies.audit),
        dependencies.auth, validateRequest({ params: employeeV2Params, body: updateEmployeeV2Body }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.update(context, request.params.employeeId as string, request.body));
        });
    router.delete("/employee/delete/:employeeId", createV2HttpAudit("employee.deactivate", dependencies.audit),
        dependencies.auth, validateRequest({ params: employeeV2Params }), async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            send(response, await dependencies.service.deactivate(context, request.params.employeeId as string));
        });
    router.put("/employee/:employeeId/account", createV2HttpAudit("employee.link_account", dependencies.audit),
        dependencies.auth, validateRequest({ params: employeeV2Params, body: linkEmployeeAccountV2Body }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            sendAssignment(response, await dependencies.assignments.linkAccount(context,
                request.params.employeeId as string, request.body.accountId));
        });
    router.put("/employee/:employeeId/transfer", createV2HttpAudit("employee.transfer", dependencies.audit),
        dependencies.auth, validateRequest({ params: employeeV2Params, body: transferEmployeeV2Body }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            sendAssignment(response, await dependencies.assignments.transfer(context,
                request.params.employeeId as string, request.body.branchId));
        });
    return router;
};
