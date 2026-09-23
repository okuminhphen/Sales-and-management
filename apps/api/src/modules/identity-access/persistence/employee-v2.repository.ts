import { UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId,
    serializeMoney,
} from "../../../shared/contracts/database-scalars.js";
import type {
    EmployeeMutationResult,
    EmployeePatch,
    EmployeePage,
    EmployeeProfile,
    EmployeeListQuery,
    EmployeeV2Repository,
    NewEmployee,
} from "../application/employee-v2.service.js";
import type {
    AccountAttributes,
    BranchAttributes,
    EmployeeAttributes,
} from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

const duplicateConstraint = (error: unknown): "code" | "account" | null => {
    if (!error || typeof error !== "object") return null;
    const parent = "parent" in error ? error.parent : undefined;
    const original = "original" in error ? error.original : undefined;
    const fields = [error, parent, original].flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        return ["message", "sqlMessage", "constraint", "path"]
            .map((key) => key in candidate && typeof candidate[key as keyof typeof candidate] === "string"
                ? candidate[key as keyof typeof candidate]
                : "")
            .filter(Boolean);
    });
    if (error instanceof UniqueConstraintError) {
        fields.push(...error.errors
            .flatMap((item) => [item.path, item.message])
            .filter((value): value is string => typeof value === "string" && value.length > 0));
    }
    const detail = fields.join(" ");
    if (/uq_employees_code|employees\.code|\bcode\b/i.test(detail)) return "code";
    if (/uq_employees_account|employees\.account_id|\baccount_id\b/i.test(detail)) return "account";
    return null;
};

const toEmployeeProfile = (employee: EmployeeAttributes): EmployeeProfile => ({
    id: serializeDatabaseEntityId(employee.id),
    accountId: employee.accountId === null ? null : serializeDatabaseEntityId(employee.accountId),
    branchId: serializeDatabaseEntityId(employee.branchId),
    code: employee.code,
    fullName: employee.fullName,
    position: employee.position,
    phone: employee.phone,
    email: employee.email,
    salary: employee.salary === null ? null : serializeMoney(employee.salary),
    status: employee.status,
    hiredAt: employee.hiredAt,
});

/** MySQL adapter for the employee aggregate; it retains employee history by status. */
export class SequelizeEmployeeV2Repository implements EmployeeV2Repository {
    private readonly account: IdentityAccessModel<AccountAttributes>;
    private readonly branch: IdentityAccessModel<BranchAttributes>;
    private readonly employee: IdentityAccessModel<EmployeeAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
        this.branch = getIdentityAccessModel<BranchAttributes>(persistence, "Branch");
        this.employee = getIdentityAccessModel<EmployeeAttributes>(persistence, "Employee");
    }

    async findById(employeeId: string): Promise<EmployeeProfile | null> {
        const employee = await this.employee.findByPk(employeeId);
        return employee ? toEmployeeProfile(employee.dataValues) : null;
    }

    async listByBranch(branchId: string, query: EmployeeListQuery): Promise<EmployeePage> {
        const { count, rows } = await this.employee.findAndCountAll({
            where: { branchId },
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["code", "ASC"]],
        });
        return {
            employees: rows.map((employee) => toEmployeeProfile(employee.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }

    async createEmployee(input: NewEmployee): Promise<EmployeeMutationResult> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const branch = await this.branch.findByPk(input.branchId, { transaction, lock: transaction.LOCK.UPDATE });
                if (!branch) return { kind: "branch_not_found" };
                if (input.accountId !== null) {
                    const account = await this.account.findByPk(input.accountId, { transaction, lock: transaction.LOCK.UPDATE });
                    if (!account || account.dataValues.status !== "active") {
                        return { kind: "account_not_active_or_not_found" };
                    }
                }
                const now = new Date();
                const employee = await this.employee.create({
                    ...input,
                    status: "active",
                    createdAt: now,
                    updatedAt: now,
                }, { transaction });
                return toEmployeeProfile(employee.dataValues);
            });
        } catch (error) {
            const duplicate = duplicateConstraint(error);
            if (duplicate === "code") return { kind: "employee_code_conflict" };
            if (duplicate === "account") return { kind: "account_already_linked" };
            throw error;
        }
    }

    async updateEmployee(
        employeeId: string,
        expectedBranchId: string,
        patch: EmployeePatch,
    ): Promise<EmployeeMutationResult> {
        return this.persistence.inTransaction(async (transaction) => {
            const employee = await this.employee.findOne({
                where: { id: employeeId, branchId: expectedBranchId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!employee) return { kind: "employee_not_found" };
            await employee.update({ ...patch, updatedAt: new Date() }, { transaction });
            return toEmployeeProfile(employee.dataValues);
        });
    }

    async deactivateEmployee(employeeId: string, expectedBranchId: string): Promise<EmployeeMutationResult> {
        return this.persistence.inTransaction(async (transaction) => {
            const employee = await this.employee.findOne({
                where: { id: employeeId, branchId: expectedBranchId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!employee) return { kind: "employee_not_found" };
            await employee.update({ status: "inactive", updatedAt: new Date() }, { transaction });
            return toEmployeeProfile(employee.dataValues);
        });
    }
}
