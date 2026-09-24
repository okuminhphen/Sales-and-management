import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { hasGlobalPermission, type V2AccessContext } from "./access-context.js";
import type { EmployeeProfile } from "./employee-v2.service.js";

export type EmployeeAssignmentResult =
    | { kind: "updated"; employee: EmployeeProfile }
    | { kind: "forbidden" | "invalid_input" | "employee_not_found" | "employee_not_active"
        | "branch_not_found" | "same_branch" | "account_not_active_or_not_found"
        | "account_already_linked" | "account_roles_require_review" | "assignment_unavailable" };

export interface EmployeeAssignmentV2Repository {
    linkAccount: (employeeId: EntityId, accountId: EntityId | null) => Promise<EmployeeAssignmentResult>;
    transfer: (employeeId: EntityId, branchId: EntityId) => Promise<EmployeeAssignmentResult>;
}

const id = (value: string): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** Changes to identity or branch scope require a global HR grant and explicit audit. */
export class EmployeeAssignmentV2Service {
    constructor(private readonly dependencies: { repository: EmployeeAssignmentV2Repository }) {}

    async linkAccount(context: V2AccessContext, rawEmployeeId: string, rawAccountId: string | null): Promise<EmployeeAssignmentResult> {
        if (!hasGlobalPermission(context, "employee.manage.global")) return { kind: "forbidden" };
        const employeeId = id(rawEmployeeId);
        const accountId = rawAccountId === null ? null : id(rawAccountId);
        if (!employeeId || (rawAccountId !== null && !accountId)) return { kind: "invalid_input" };
        try { return await this.dependencies.repository.linkAccount(employeeId, accountId); }
        catch { return { kind: "assignment_unavailable" }; }
    }

    async transfer(context: V2AccessContext, rawEmployeeId: string, rawBranchId: string): Promise<EmployeeAssignmentResult> {
        if (!hasGlobalPermission(context, "employee.manage.global")) return { kind: "forbidden" };
        const employeeId = id(rawEmployeeId);
        const branchId = id(rawBranchId);
        if (!employeeId || !branchId) return { kind: "invalid_input" };
        try { return await this.dependencies.repository.transfer(employeeId, branchId); }
        catch { return { kind: "assignment_unavailable" }; }
    }
}
