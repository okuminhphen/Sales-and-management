import { Op, QueryTypes, UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { EmployeeAssignmentResult, EmployeeAssignmentV2Repository } from "../application/employee-assignment-v2.service.js";
import type { EmployeeProfile } from "../application/employee-v2.service.js";
import type { AccountAttributes, AccountRoleAttributes, BranchAttributes,
    EmployeeAttributes } from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

const profile = (employee: EmployeeAttributes): EmployeeProfile => ({
    id: serializeDatabaseEntityId(employee.id),
    accountId: employee.accountId === null ? null : serializeDatabaseEntityId(employee.accountId),
    branchId: serializeDatabaseEntityId(employee.branchId),
    code: employee.code, fullName: employee.fullName, position: employee.position,
    phone: employee.phone, email: employee.email,
    salary: employee.salary === null ? null : serializeMoney(employee.salary),
    status: employee.status, hiredAt: employee.hiredAt,
});

class EmployeeBranchChanged extends Error {}

export class SequelizeEmployeeAssignmentV2Repository implements EmployeeAssignmentV2Repository {
    private readonly account: IdentityAccessModel<AccountAttributes>;
    private readonly employee: IdentityAccessModel<EmployeeAttributes>;
    private readonly branch: IdentityAccessModel<BranchAttributes>;
    private readonly accountRole: IdentityAccessModel<AccountRoleAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
        this.employee = getIdentityAccessModel<EmployeeAttributes>(persistence, "Employee");
        this.branch = getIdentityAccessModel<BranchAttributes>(persistence, "Branch");
        this.accountRole = getIdentityAccessModel<AccountRoleAttributes>(persistence, "AccountRole");
    }

    async linkAccount(employeeId: EntityId, accountId: EntityId | null): Promise<EmployeeAssignmentResult> {
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction(async (transaction) => {
                const employee = await this.employee.findByPk(employeeId, { transaction, lock: transaction.LOCK.UPDATE });
                if (!employee) return { kind: "employee_not_found" };
                if (employee.dataValues.status !== "active") return { kind: "employee_not_active" };
                if (employee.dataValues.accountId === accountId) {
                    return { kind: "updated", employee: profile(employee.dataValues) };
                }
                if (accountId !== null) {
                    const account = await this.account.findByPk(accountId, { transaction, lock: transaction.LOCK.UPDATE });
                    if (!account || account.dataValues.status !== "active") {
                        return { kind: "account_not_active_or_not_found" };
                    }
                    // Linking must not activate stale backoffice grants that were
                    // assigned while the account lacked an employee profile.
                    const roles = await this.persistence.sequelize.query<{ id: string }>(
                        "SELECT ar.id FROM account_roles ar JOIN roles r ON r.id = ar.role_id WHERE ar.account_id = ? AND r.code <> 'CUSTOMER' LIMIT 1 FOR UPDATE",
                        { replacements: [accountId], transaction, type: QueryTypes.SELECT });
                    if (roles.length) return { kind: "account_roles_require_review" };
                }
                await employee.update({ accountId, updatedAt: new Date() }, { transaction });
                return { kind: "updated", employee: profile(employee.dataValues) };
            }));
        } catch (error) {
            if (error instanceof UniqueConstraintError
                && Object.prototype.hasOwnProperty.call(error.fields ?? {}, "uq_employees_account")) {
                return { kind: "account_already_linked" };
            }
            throw error;
        }
    }

    async transfer(employeeId: EntityId, targetBranchId: EntityId): Promise<EmployeeAssignmentResult> {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return await retryV2Transaction(() => this.persistence.inTransaction(async (transaction) => {
            // Lock branches in a stable order before the employee so manager
            // assignment and deactivation use the same lock order.
            const current = await this.employee.findByPk(employeeId, { transaction });
            if (!current) return { kind: "employee_not_found" };
            const currentBranchId = serializeDatabaseEntityId(current.dataValues.branchId);
            if (currentBranchId === targetBranchId) return { kind: "same_branch" };
            const branchIds = [currentBranchId, targetBranchId].sort((a, b) =>
                BigInt(a) < BigInt(b) ? -1 : 1);
            const branches = await this.branch.findAll({ where: { id: { [Op.in]: branchIds } },
                order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
            if (branches.length !== 2) return { kind: "branch_not_found" };
            const employee = await this.employee.findByPk(employeeId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!employee) return { kind: "employee_not_found" };
            if (employee.dataValues.status !== "active") return { kind: "employee_not_active" };
            if (serializeDatabaseEntityId(employee.dataValues.branchId) !== currentBranchId) {
                // Another transfer raced this read; retry the entire operation.
                throw new EmployeeBranchChanged();
            }
            const oldBranch = branches.find((branch) => serializeDatabaseEntityId(branch.dataValues.id) === currentBranchId)!;
            if (oldBranch.dataValues.managerEmployeeId !== null
                && serializeDatabaseEntityId(oldBranch.dataValues.managerEmployeeId) === employeeId) {
                await oldBranch.update({ managerEmployeeId: null, updatedAt: new Date() }, { transaction });
            }
            if (employee.dataValues.accountId !== null) {
                const accountId = serializeDatabaseEntityId(employee.dataValues.accountId);
                await this.accountRole.destroy({ where: { accountId, scopeType: "branch", branchId: currentBranchId },
                    transaction });
            }
            await employee.update({ branchId: targetBranchId, updatedAt: new Date() }, { transaction });
            return { kind: "updated", employee: profile(employee.dataValues) };
                }));
            } catch (error) {
                if (error instanceof EmployeeBranchChanged && attempt < 2) continue;
                throw error;
            }
        }
        throw new EmployeeBranchChanged();
    }
}
