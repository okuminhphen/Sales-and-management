import {
    serializeEntityId,
    serializeMoney,
    type EntityId,
    type Money,
} from "../../../shared/contracts/database-scalars.js";
import { canAccessBranch, type V2AccessContext } from "./access-context.js";

export type EmployeeProfile = {
    id: EntityId;
    accountId: EntityId | null;
    branchId: EntityId;
    code: string;
    fullName: string;
    position: string | null;
    phone: string | null;
    email: string | null;
    salary: Money | null;
    status: "active" | "inactive";
    hiredAt: Date | null;
};

export type CreateEmployeeInput = {
    branchId: string;
    accountId?: string | null;
    code: string;
    fullName: string;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
    salary?: string | null;
    hiredAt?: Date | null;
};

export type UpdateEmployeeInput = {
    fullName?: string;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
    salary?: string | null;
    hiredAt?: Date | null;
};

export type NewEmployee = {
    branchId: EntityId;
    accountId: EntityId | null;
    code: string;
    fullName: string;
    position: string | null;
    phone: string | null;
    email: string | null;
    salary: Money | null;
    hiredAt: Date | null;
};

export type EmployeePatch = Omit<Partial<NewEmployee>, "branchId" | "accountId" | "code">;

export type EmployeeMutationResult =
    | EmployeeProfile
    | { kind: "employee_not_found" }
    | { kind: "branch_not_found" }
    | { kind: "account_not_active_or_not_found" }
    | { kind: "employee_code_conflict" }
    | { kind: "account_already_linked" };

export interface EmployeeV2Repository {
    findById: (employeeId: EntityId) => Promise<EmployeeProfile | null>;
    listByBranch: (branchId: EntityId) => Promise<readonly EmployeeProfile[]>;
    createEmployee: (input: NewEmployee) => Promise<EmployeeMutationResult>;
    updateEmployee: (
        employeeId: EntityId,
        expectedBranchId: EntityId,
        patch: EmployeePatch,
    ) => Promise<EmployeeMutationResult>;
    deactivateEmployee: (employeeId: EntityId, expectedBranchId: EntityId) => Promise<EmployeeMutationResult>;
}

export type EmployeeResult =
    | { kind: "forbidden" }
    | { kind: "invalid_employee_input" }
    | { kind: "employees"; employees: readonly EmployeeProfile[] }
    | { kind: "created"; employee: EmployeeProfile }
    | { kind: "updated"; employee: EmployeeProfile }
    | { kind: "deactivated"; employee: EmployeeProfile }
    | { kind: "employee_not_found" }
    | { kind: "branch_not_found" }
    | { kind: "account_not_active_or_not_found" }
    | { kind: "employee_code_conflict" }
    | { kind: "account_already_linked" }
    | { kind: "employee_unavailable" };

const employeeCodePattern = /^[A-Z][A-Z0-9_-]{2,49}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value: unknown, maximumLength: number): string | undefined =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength
        ? value.trim()
        : undefined;

const normalizeNullableText = (
    value: unknown,
    maximumLength: number,
): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return normalizeText(value, maximumLength);
};

const normalizeEmail = (value: unknown): string | null | undefined => {
    const normalized = normalizeNullableText(value, 255);
    if (normalized === null || normalized === undefined) return normalized;
    const email = normalized.toLowerCase();
    return emailPattern.test(email) ? email : undefined;
};

const normalizeMoney = (value: unknown): Money | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    try {
        return serializeMoney(value);
    } catch {
        return undefined;
    }
};

const normalizeDate = (value: unknown): Date | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
};

const parseEntityId = (value: unknown): EntityId | null => {
    try {
        return serializeEntityId(value);
    } catch {
        return null;
    }
};

const canManageEmployeesAt = (context: V2AccessContext, branchId: EntityId): boolean =>
    canAccessBranch(context, branchId, "employee.manage.branch")
    || canAccessBranch(context, branchId, "employee.manage.global");

const canReadEmployeesAt = (context: V2AccessContext, branchId: EntityId): boolean =>
    canAccessBranch(context, branchId, "employee.read.branch") || canManageEmployeesAt(context, branchId);

const isEmployee = (result: EmployeeMutationResult): result is EmployeeProfile => "id" in result;

/**
 * Branch-scoped employee directory. Account linking and inter-branch transfer
 * deliberately remain separate use-cases because both alter authorization/audit
 * boundaries; this service never accepts a client-supplied employee status.
 */
export class EmployeeV2Service {
    constructor(private readonly dependencies: { repository: EmployeeV2Repository }) {}

    async listByBranch(context: V2AccessContext, rawBranchId: string): Promise<EmployeeResult> {
        const branchId = parseEntityId(rawBranchId);
        if (!branchId) return { kind: "invalid_employee_input" };
        if (!canReadEmployeesAt(context, branchId)) return { kind: "forbidden" };
        try {
            return { kind: "employees", employees: await this.dependencies.repository.listByBranch(branchId) };
        } catch {
            return { kind: "employee_unavailable" };
        }
    }

    async create(context: V2AccessContext, input: CreateEmployeeInput): Promise<EmployeeResult> {
        const employee = this.normalizeNewEmployee(input);
        if (!employee) return { kind: "invalid_employee_input" };
        if (!canManageEmployeesAt(context, employee.branchId)) return { kind: "forbidden" };
        return this.mapMutation(() => this.dependencies.repository.createEmployee(employee), "created");
    }

    async update(
        context: V2AccessContext,
        rawEmployeeId: string,
        input: UpdateEmployeeInput,
    ): Promise<EmployeeResult> {
        const employeeId = parseEntityId(rawEmployeeId);
        const patch = this.normalizePatch(input);
        if (!employeeId || !patch) return { kind: "invalid_employee_input" };
        const existing = await this.findForManagement(context, employeeId);
        if ("kind" in existing) return existing;
        return this.mapMutation(
            () => this.dependencies.repository.updateEmployee(employeeId, existing.branchId, patch),
            "updated",
        );
    }

    async deactivate(context: V2AccessContext, rawEmployeeId: string): Promise<EmployeeResult> {
        const employeeId = parseEntityId(rawEmployeeId);
        if (!employeeId) return { kind: "invalid_employee_input" };
        const existing = await this.findForManagement(context, employeeId);
        if ("kind" in existing) return existing;
        return this.mapMutation(
            () => this.dependencies.repository.deactivateEmployee(employeeId, existing.branchId),
            "deactivated",
        );
    }

    private normalizeNewEmployee(input: CreateEmployeeInput): NewEmployee | null {
        const branchId = parseEntityId(input.branchId);
        const accountId = input.accountId === undefined || input.accountId === null
            ? null
            : parseEntityId(input.accountId);
        const code = typeof input.code === "string" ? input.code.trim() : "";
        const fullName = normalizeText(input.fullName, 255);
        const position = input.position === undefined ? null : normalizeNullableText(input.position, 150);
        const phone = input.phone === undefined ? null : normalizeNullableText(input.phone, 30);
        const email = input.email === undefined ? null : normalizeEmail(input.email);
        const salary = input.salary === undefined ? null : normalizeMoney(input.salary);
        const hiredAt = input.hiredAt === undefined ? null : normalizeDate(input.hiredAt);
        if (
            !branchId || (input.accountId !== undefined && input.accountId !== null && !accountId)
            || !employeeCodePattern.test(code) || !fullName || position === undefined || phone === undefined
            || email === undefined || salary === undefined || hiredAt === undefined
        ) return null;
        return { branchId, accountId, code, fullName, position, phone, email, salary, hiredAt };
    }

    private normalizePatch(input: UpdateEmployeeInput): EmployeePatch | null {
        const fullName = input.fullName === undefined ? undefined : normalizeText(input.fullName, 255);
        const position = normalizeNullableText(input.position, 150);
        const phone = normalizeNullableText(input.phone, 30);
        const email = normalizeEmail(input.email);
        const salary = normalizeMoney(input.salary);
        const hiredAt = normalizeDate(input.hiredAt);
        if (
            fullName === undefined && input.fullName !== undefined
            || position === undefined && input.position !== undefined
            || phone === undefined && input.phone !== undefined
            || email === undefined && input.email !== undefined
            || salary === undefined && input.salary !== undefined
            || hiredAt === undefined && input.hiredAt !== undefined
        ) return null;
        if (
            fullName === undefined && position === undefined && phone === undefined && email === undefined
            && salary === undefined && hiredAt === undefined
        ) return null;
        return {
            ...(fullName === undefined ? {} : { fullName }),
            ...(position === undefined ? {} : { position }),
            ...(phone === undefined ? {} : { phone }),
            ...(email === undefined ? {} : { email }),
            ...(salary === undefined ? {} : { salary }),
            ...(hiredAt === undefined ? {} : { hiredAt }),
        };
    }

    private async findForManagement(
        context: V2AccessContext,
        employeeId: EntityId,
    ): Promise<EmployeeProfile | Exclude<EmployeeResult, { kind: "employees" }>> {
        try {
            const employee = await this.dependencies.repository.findById(employeeId);
            if (!employee) return { kind: "employee_not_found" };
            return canManageEmployeesAt(context, employee.branchId) ? employee : { kind: "forbidden" };
        } catch {
            return { kind: "employee_unavailable" };
        }
    }

    private async mapMutation(
        mutate: () => Promise<EmployeeMutationResult>,
        success: "created" | "updated" | "deactivated",
    ): Promise<EmployeeResult> {
        try {
            const result = await mutate();
            if (isEmployee(result)) return { kind: success, employee: result };
            return result;
        } catch {
            return { kind: "employee_unavailable" };
        }
    }
}
