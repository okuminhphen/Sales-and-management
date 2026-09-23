import { Op, type Transaction, UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    isSystemRoleCode,
    type ManagedRole,
    type NormalizedManagedRoleInput,
    type NormalizedManagedRolePatch,
    type PermissionCatalogEntry,
    type RoleManagementMutationResult,
    type RoleManagementV2Repository,
} from "../application/role-management-v2.service.js";
import type {
    AccountRoleAttributes,
    PermissionAttributes,
    RoleAttributes,
    RolePermissionAttributes,
} from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

const roleCodeConflict = (error: unknown): boolean => {
    if (error instanceof UniqueConstraintError) return true;
    if (!error || typeof error !== "object") return false;
    const parent = "parent" in error ? error.parent : undefined;
    return Boolean(parent && typeof parent === "object" && "code" in parent && parent.code === "ER_DUP_ENTRY");
};

const sortByCode = <Entry extends { code: string }>(entries: readonly Entry[]): Entry[] =>
    [...entries].sort((left, right) => left.code.localeCompare(right.code));

/** MySQL adapter for atomic custom-role and permission-grant administration. */
export class SequelizeRoleManagementV2Repository implements RoleManagementV2Repository {
    private readonly accountRole: IdentityAccessModel<AccountRoleAttributes>;
    private readonly permission: IdentityAccessModel<PermissionAttributes>;
    private readonly role: IdentityAccessModel<RoleAttributes>;
    private readonly rolePermission: IdentityAccessModel<RolePermissionAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.accountRole = getIdentityAccessModel<AccountRoleAttributes>(persistence, "AccountRole");
        this.permission = getIdentityAccessModel<PermissionAttributes>(persistence, "Permission");
        this.role = getIdentityAccessModel<RoleAttributes>(persistence, "Role");
        this.rolePermission = getIdentityAccessModel<RolePermissionAttributes>(persistence, "RolePermission");
    }

    async listRoles(): Promise<readonly ManagedRole[]> {
        const [roles, rolePermissions, permissions] = await Promise.all([
            this.role.findAll(),
            this.rolePermission.findAll(),
            this.permission.findAll(),
        ]);
        return this.mapRoles(
            roles.map((entry) => entry.dataValues),
            rolePermissions.map((entry) => entry.dataValues),
            permissions.map((entry) => entry.dataValues),
        );
    }

    async listPermissions(): Promise<readonly PermissionCatalogEntry[]> {
        const permissions = await this.permission.findAll();
        return sortByCode(permissions.map((permission) => ({
            code: permission.dataValues.code,
            description: permission.dataValues.description,
        })));
    }

    async createRole(input: NormalizedManagedRoleInput): Promise<RoleManagementMutationResult> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const permissions = await this.findPermissionsByCodes(input.permissionCodes, transaction);
                if (!permissions) return { kind: "permission_not_found" };

                const now = new Date();
                const role = await this.role.create({
                    code: input.code,
                    name: input.name,
                    description: input.description,
                    createdAt: now,
                    updatedAt: now,
                }, { transaction });
                await this.rolePermission.bulkCreate(
                    permissions.map((permission) => ({
                        roleId: role.dataValues.id,
                        permissionId: permission.id,
                        createdAt: now,
                    })),
                    { transaction },
                );
                return this.toManagedRole(role.dataValues, permissions.map((permission) => permission.code));
            });
        } catch (error) {
            if (roleCodeConflict(error)) return { kind: "role_code_conflict" };
            throw error;
        }
    }

    async updateCustomRole(
        roleId: number,
        patch: NormalizedManagedRolePatch,
    ): Promise<RoleManagementMutationResult> {
        return this.persistence.inTransaction(async (transaction) => {
            const role = await this.role.findByPk(roleId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!role) return { kind: "role_not_found" };
            if (isSystemRoleCode(role.dataValues.code)) return { kind: "system_role_immutable" };

            const permissions = patch.permissionCodes === undefined
                ? await this.findPermissionsForRole(role.dataValues.id, transaction)
                : await this.findPermissionsByCodes(patch.permissionCodes, transaction);
            if (!permissions) return { kind: "permission_not_found" };

            const now = new Date();
            await role.update({
                ...(patch.name === undefined ? {} : { name: patch.name }),
                ...(patch.description === undefined ? {} : { description: patch.description }),
                updatedAt: now,
            }, { transaction });
            if (patch.permissionCodes !== undefined) {
                await this.rolePermission.destroy({ where: { roleId }, transaction });
                await this.rolePermission.bulkCreate(
                    permissions.map((permission) => ({
                        roleId,
                        permissionId: permission.id,
                        createdAt: now,
                    })),
                    { transaction },
                );
            }
            return this.toManagedRole(role.dataValues, permissions.map((permission) => permission.code));
        });
    }

    async deleteCustomRole(roleId: number): Promise<RoleManagementMutationResult> {
        return this.persistence.inTransaction(async (transaction) => {
            const role = await this.role.findByPk(roleId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!role) return { kind: "role_not_found" };
            if (isSystemRoleCode(role.dataValues.code)) return { kind: "system_role_immutable" };
            if (await this.accountRole.count({ where: { roleId }, transaction }) > 0) {
                return { kind: "role_in_use" };
            }

            await this.rolePermission.destroy({ where: { roleId }, transaction });
            await role.destroy({ transaction });
            return { kind: "deleted" };
        });
    }

    private async findPermissionsByCodes(
        codes: readonly string[],
        transaction: Transaction,
    ): Promise<readonly PermissionAttributes[] | null> {
        const permissions = await this.permission.findAll({ where: { code: { [Op.in]: codes } }, transaction });
        if (permissions.length !== codes.length) return null;
        const byCode = new Map(permissions.map((permission) => [permission.dataValues.code, permission.dataValues]));
        return codes.map((code) => byCode.get(code)!);
    }

    private async findPermissionsForRole(
        roleId: number,
        transaction: Transaction,
    ): Promise<readonly PermissionAttributes[]> {
        const assignments = await this.rolePermission.findAll({ where: { roleId }, transaction });
        if (assignments.length === 0) return [];
        const permissionIds = assignments.map((assignment) => assignment.dataValues.permissionId);
        const permissions = await this.permission.findAll({ where: { id: { [Op.in]: permissionIds } }, transaction });
        if (permissions.length !== permissionIds.length) {
            throw new Error("Role permission references a missing permission.");
        }
        return permissions.map((permission) => permission.dataValues);
    }

    private mapRoles(
        roles: readonly RoleAttributes[],
        assignments: readonly RolePermissionAttributes[],
        permissions: readonly PermissionAttributes[],
    ): ManagedRole[] {
        const permissionById = new Map(permissions.map((permission) => [permission.id, permission.code]));
        const permissionCodesByRoleId = new Map<number, string[]>();
        for (const assignment of assignments) {
            const permissionCode = permissionById.get(assignment.permissionId);
            if (!permissionCode) throw new Error("Role permission references a missing permission.");
            const codes = permissionCodesByRoleId.get(assignment.roleId) ?? [];
            codes.push(permissionCode);
            permissionCodesByRoleId.set(assignment.roleId, codes);
        }
        return sortByCode(roles.map((role) => this.toManagedRole(role, permissionCodesByRoleId.get(role.id) ?? [])));
    }

    private toManagedRole(role: RoleAttributes, permissionCodes: readonly string[]): ManagedRole {
        return {
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            permissionCodes: [...permissionCodes].sort((left, right) => left.localeCompare(right)),
        };
    }
}
