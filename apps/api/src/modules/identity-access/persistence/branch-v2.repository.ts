import { UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    BranchMutationResult,
    BranchPatch,
    BranchPage,
    BranchListQuery,
    BranchProfile,
    BranchV2Repository,
    NewBranch,
} from "../application/branch-v2.service.js";
import type { BranchAttributes, EmployeeAttributes } from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

const isBranchCodeConflict = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false;
    const parent = "parent" in error ? error.parent : undefined;
    const original = "original" in error ? error.original : undefined;
    const values = [error, parent, original].flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        return ["message", "sqlMessage", "constraint", "path"]
            .map((key) => key in candidate && typeof candidate[key as keyof typeof candidate] === "string"
                ? candidate[key as keyof typeof candidate]
                : "")
            .filter(Boolean);
    });
    if (error instanceof UniqueConstraintError) {
        values.push(...error.errors
            .flatMap((item) => [item.path, item.message])
            .filter((value): value is string => typeof value === "string" && value.length > 0));
    }
    return /uq_branches_code|branches\.code|\bcode\b/i.test(values.join(" "));
};

const toBranchProfile = (branch: BranchAttributes): BranchProfile => ({
    id: serializeDatabaseEntityId(branch.id),
    code: branch.code,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    email: branch.email,
    type: branch.type,
    managerEmployeeId: branch.managerEmployeeId === null
        ? null
        : serializeDatabaseEntityId(branch.managerEmployeeId),
});

/** MySQL adapter for branch data; cross-domain manager/inventory work stays outside this aggregate. */
export class SequelizeBranchV2Repository implements BranchV2Repository {
    private readonly branch: IdentityAccessModel<BranchAttributes>;
    private readonly employee: IdentityAccessModel<EmployeeAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.branch = getIdentityAccessModel<BranchAttributes>(persistence, "Branch");
        this.employee = getIdentityAccessModel<EmployeeAttributes>(persistence, "Employee");
    }

    async findById(branchId: string): Promise<BranchProfile | null> {
        const branch = await this.branch.findByPk(branchId);
        return branch ? toBranchProfile(branch.dataValues) : null;
    }

    async listBranches(query: BranchListQuery): Promise<BranchPage> {
        const { count, rows } = await this.branch.findAndCountAll({
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["code", "ASC"]],
        });
        return {
            branches: rows.map((branch) => toBranchProfile(branch.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }

    async createBranch(input: NewBranch): Promise<BranchMutationResult> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const now = new Date();
                const branch = await this.branch.create({
                    ...input,
                    managerEmployeeId: null,
                    createdAt: now,
                    updatedAt: now,
                }, { transaction });
                return toBranchProfile(branch.dataValues);
            });
        } catch (error) {
            if (isBranchCodeConflict(error)) return { kind: "branch_code_conflict" };
            throw error;
        }
    }

    async updateBranch(branchId: string, patch: BranchPatch): Promise<BranchMutationResult> {
        return this.persistence.inTransaction(async (transaction) => {
            const branch = await this.branch.findByPk(branchId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!branch) return { kind: "branch_not_found" };
            await branch.update({ ...patch, updatedAt: new Date() }, { transaction });
            return toBranchProfile(branch.dataValues);
        });
    }

    async assignManager(branchId: string, employeeId: string | null): Promise<BranchMutationResult> {
        return this.persistence.inTransaction(async (transaction) => {
            const branch = await this.branch.findByPk(branchId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!branch) return { kind: "branch_not_found" };
            if (employeeId !== null) {
                const employee = await this.employee.findByPk(employeeId, { transaction, lock: transaction.LOCK.UPDATE });
                if (!employee || employee.dataValues.status !== "active"
                    || serializeDatabaseEntityId(employee.dataValues.branchId) !== branchId) {
                    return { kind: "manager_not_eligible" };
                }
            }
            await branch.update({ managerEmployeeId: employeeId, updatedAt: new Date() }, { transaction });
            return toBranchProfile(branch.dataValues);
        });
    }
}
