import { hasGlobalPermission, type V2AccessContext } from "./access-context.js";

export type ManagedRole = {
    id: number;
    code: string;
    name: string;
    description: string | null;
    permissionCodes: readonly string[];
};

export type PermissionCatalogEntry = {
    code: string;
    description: string | null;
};

export type CreateManagedRoleInput = {
    code: string;
    name: string;
    description?: string | null;
    permissionCodes: readonly string[];
};

export type UpdateManagedRoleInput = {
    name?: string;
    description?: string | null;
    permissionCodes?: readonly string[];
};

export type NormalizedManagedRoleInput = {
    code: string;
    name: string;
    description: string | null;
    permissionCodes: readonly string[];
};

export type NormalizedManagedRolePatch = {
    name?: string;
    description?: string | null;
    permissionCodes?: readonly string[];
};

export type RoleManagementMutationResult =
    | ManagedRole
    | { kind: "role_not_found" }
    | { kind: "role_code_conflict" }
    | { kind: "permission_not_found" }
    | { kind: "system_role_immutable" }
    | { kind: "role_in_use" }
    | { kind: "deleted" };

/** Persistence port; every mutation is implemented as one database transaction. */
export interface RoleManagementV2Repository {
    listRoles: () => Promise<readonly ManagedRole[]>;
    listPermissions: () => Promise<readonly PermissionCatalogEntry[]>;
    createRole: (input: NormalizedManagedRoleInput) => Promise<RoleManagementMutationResult>;
    updateCustomRole: (
        roleId: number,
        patch: NormalizedManagedRolePatch,
    ) => Promise<RoleManagementMutationResult>;
    deleteCustomRole: (roleId: number) => Promise<RoleManagementMutationResult>;
}

export type RoleManagementResult =
    | { kind: "forbidden" }
    | { kind: "invalid_role_input" }
    | { kind: "roles"; roles: readonly ManagedRole[] }
    | { kind: "permissions"; permissions: readonly PermissionCatalogEntry[] }
    | { kind: "created"; role: ManagedRole }
    | { kind: "updated"; role: ManagedRole }
    | { kind: "deleted" }
    | { kind: "role_not_found" }
    | { kind: "role_code_conflict" }
    | { kind: "permission_not_found" }
    | { kind: "system_role_immutable" }
    | { kind: "role_in_use" }
    | { kind: "role_management_unavailable" };

const roleCodePattern = /^[A-Z][A-Z0-9_]{2,99}$/;
const managementReadPermission = "role.read.global";
const managementWritePermission = "role.manage.global";
const systemRoleCodes = new Set([
    "CUSTOMER",
    "SALES_STAFF",
    "INVENTORY_STAFF",
    "CUSTOMER_SUPPORT",
    "BRANCH_MANAGER",
    "SUPER_ADMIN",
]);

export const isSystemRoleCode = (code: string): boolean => systemRoleCodes.has(code);

const normalizeText = (value: unknown, maximumLength: number): string | null =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength
        ? value.trim()
        : null;

const normalizeDescription = (value: unknown): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return normalizeText(value, 500) ?? undefined;
};

const normalizePermissionCodes = (rawCodes: unknown): readonly string[] | null => {
    if (!Array.isArray(rawCodes) || rawCodes.length === 0) return null;
    const codes = rawCodes.map((code) => typeof code === "string" ? code.trim() : "");
    if (codes.some((code) => !code) || new Set(codes).size !== codes.length) return null;
    return [...codes].sort((left, right) => left.localeCompare(right));
};

const normalizeCreateInput = (input: CreateManagedRoleInput): NormalizedManagedRoleInput | null => {
    const code = typeof input.code === "string" ? input.code.trim() : "";
    const name = normalizeText(input.name, 150);
    const description = input.description === undefined ? null : normalizeDescription(input.description);
    const permissionCodes = normalizePermissionCodes(input.permissionCodes);
    if (!roleCodePattern.test(code) || !name || description === undefined || !permissionCodes) return null;
    return { code, name, description, permissionCodes };
};

const normalizeUpdateInput = (input: UpdateManagedRoleInput): NormalizedManagedRolePatch | null => {
    const name = input.name === undefined ? undefined : normalizeText(input.name, 150);
    const description = input.description === undefined ? undefined : normalizeDescription(input.description);
    const permissionCodes = input.permissionCodes === undefined
        ? undefined
        : normalizePermissionCodes(input.permissionCodes);
    if (name === null || (input.description !== undefined && description === undefined) || permissionCodes === null) return null;
    if (name === undefined && input.description === undefined && permissionCodes === undefined) return null;
    return {
        ...(name === undefined ? {} : { name }),
        ...(input.description === undefined ? {} : { description }),
        ...(permissionCodes === undefined ? {} : { permissionCodes }),
    };
};

const isManagedRole = (result: RoleManagementMutationResult): result is ManagedRole =>
    "id" in result;

/**
 * Application policy for custom role administration. Seeded system roles are
 * intentionally immutable through this capability; their baseline belongs to
 * versioned seed/migration code, not an ad-hoc runtime admin request.
 */
export class RoleManagementV2Service {
    constructor(private readonly dependencies: { repository: RoleManagementV2Repository }) {}

    async listRoles(context: V2AccessContext): Promise<RoleManagementResult> {
        if (!hasGlobalPermission(context, managementReadPermission)) return { kind: "forbidden" };
        try {
            return { kind: "roles", roles: await this.dependencies.repository.listRoles() };
        } catch {
            return { kind: "role_management_unavailable" };
        }
    }

    async listPermissions(context: V2AccessContext): Promise<RoleManagementResult> {
        if (!hasGlobalPermission(context, managementReadPermission)) return { kind: "forbidden" };
        try {
            return { kind: "permissions", permissions: await this.dependencies.repository.listPermissions() };
        } catch {
            return { kind: "role_management_unavailable" };
        }
    }

    async createRole(context: V2AccessContext, input: CreateManagedRoleInput): Promise<RoleManagementResult> {
        if (!hasGlobalPermission(context, managementWritePermission)) return { kind: "forbidden" };
        const normalized = normalizeCreateInput(input);
        if (!normalized) return { kind: "invalid_role_input" };
        return this.mapMutation(() => this.dependencies.repository.createRole(normalized), "created");
    }

    async updateRole(
        context: V2AccessContext,
        roleId: number,
        input: UpdateManagedRoleInput,
    ): Promise<RoleManagementResult> {
        if (!hasGlobalPermission(context, managementWritePermission)) return { kind: "forbidden" };
        if (!Number.isInteger(roleId) || roleId <= 0) return { kind: "invalid_role_input" };
        const normalized = normalizeUpdateInput(input);
        if (!normalized) return { kind: "invalid_role_input" };
        return this.mapMutation(
            () => this.dependencies.repository.updateCustomRole(roleId, normalized),
            "updated",
        );
    }

    async deleteRole(context: V2AccessContext, roleId: number): Promise<RoleManagementResult> {
        if (!hasGlobalPermission(context, managementWritePermission)) return { kind: "forbidden" };
        if (!Number.isInteger(roleId) || roleId <= 0) return { kind: "invalid_role_input" };
        return this.mapMutation(() => this.dependencies.repository.deleteCustomRole(roleId), "deleted");
    }

    private async mapMutation(
        mutate: () => Promise<RoleManagementMutationResult>,
        success: "created" | "updated" | "deleted",
    ): Promise<RoleManagementResult> {
        try {
            const result = await mutate();
            if (isManagedRole(result)) {
                if (success === "deleted") return { kind: "role_management_unavailable" };
                return success === "created"
                    ? { kind: "created", role: result }
                    : { kind: "updated", role: result };
            }
            return result;
        } catch {
            return { kind: "role_management_unavailable" };
        }
    }
}
