import { describe, expect, it, vi } from "vitest";
import {
    RoleManagementV2Service,
    type ManagedRole,
    type RoleManagementV2Repository,
} from "../../src/modules/identity-access/application/role-management-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const managedRole: ManagedRole = {
    id: 101,
    code: "ANALYTICS_VIEWER",
    name: "Analytics viewer",
    description: "Read-only analytics access.",
    permissionCodes: ["audit.read.global"],
};

const globalRoleManager: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: null,
    employeeId: null,
    grants: [{
        roleCode: "SUPER_ADMIN",
        scope: { type: "global" },
        permissions: ["role.read.global", "role.manage.global"],
    }],
};

const createRepository = (): RoleManagementV2Repository => ({
    listRoles: vi.fn(async () => [managedRole]),
    listPermissions: vi.fn(async () => [{
        code: "audit.read.global",
        description: "Read audit data.",
    }]),
    createRole: vi.fn(async () => managedRole),
    updateCustomRole: vi.fn(async () => managedRole),
    deleteCustomRole: vi.fn(async () => ({ kind: "deleted" as const })),
});

describe("RoleManagementV2Service", () => {
    it("requires a global grant and never treats a branch role-management grant as global authority", async () => {
        const repository = createRepository();
        const service = new RoleManagementV2Service({ repository });
        const branchManager: V2AccessContext = {
            ...globalRoleManager,
            grants: [{
                roleCode: "BRANCH_MANAGER",
                scope: { type: "branch", branchId: "9007199254740994" },
                permissions: ["role.read.global", "role.manage.global"],
            }],
        };

        await expect(service.listRoles(branchManager)).resolves.toEqual({ kind: "forbidden" });
        await expect(service.createRole(branchManager, {
            code: "ANALYTICS_VIEWER",
            name: "Analytics viewer",
            permissionCodes: ["audit.read.global"],
        })).resolves.toEqual({ kind: "forbidden" });
        expect(repository.listRoles).not.toHaveBeenCalled();
        expect(repository.createRole).not.toHaveBeenCalled();
    });

    it("normalizes a custom role input and delegates a validated permission set", async () => {
        const repository = createRepository();
        const service = new RoleManagementV2Service({ repository });

        await expect(service.createRole(globalRoleManager, {
            code: "ANALYTICS_VIEWER",
            name: "  Analytics viewer  ",
            description: "  Read-only analytics access. ",
            permissionCodes: ["audit.read.global"],
        })).resolves.toEqual({ kind: "created", role: managedRole });
        expect(repository.createRole).toHaveBeenCalledWith({
            code: "ANALYTICS_VIEWER",
            name: "Analytics viewer",
            description: "Read-only analytics access.",
            permissionCodes: ["audit.read.global"],
        });
    });

    it("rejects malformed codes and duplicate or empty permission sets before persistence", async () => {
        const repository = createRepository();
        const service = new RoleManagementV2Service({ repository });

        await expect(service.createRole(globalRoleManager, {
            code: "bad role",
            name: "Bad role",
            permissionCodes: ["audit.read.global"],
        })).resolves.toEqual({ kind: "invalid_role_input" });
        await expect(service.createRole(globalRoleManager, {
            code: "ANALYTICS_VIEWER",
            name: "Analytics viewer",
            permissionCodes: ["audit.read.global", "audit.read.global"],
        })).resolves.toEqual({ kind: "invalid_role_input" });
        await expect(service.createRole(globalRoleManager, {
            code: "ANALYTICS_VIEWER",
            name: "Analytics viewer",
            permissionCodes: [],
        })).resolves.toEqual({ kind: "invalid_role_input" });
        await expect(service.createRole(globalRoleManager, {
            code: "ANALYTICS_VIEWER",
            name: "Analytics viewer",
            description: "   ",
            permissionCodes: ["audit.read.global"],
        })).resolves.toEqual({ kind: "invalid_role_input" });
        expect(repository.createRole).not.toHaveBeenCalled();
    });

    it("does not expose persistence details when a requested permission does not exist", async () => {
        const repository = createRepository();
        vi.mocked(repository.createRole).mockResolvedValueOnce({ kind: "permission_not_found" });
        const service = new RoleManagementV2Service({ repository });

        await expect(service.createRole(globalRoleManager, {
            code: "ANALYTICS_VIEWER",
            name: "Analytics viewer",
            permissionCodes: ["audit.read.global"],
        })).resolves.toEqual({ kind: "permission_not_found" });
    });

    it("keeps seeded system roles immutable and prevents deleting a role with account assignments", async () => {
        const repository = createRepository();
        vi.mocked(repository.updateCustomRole).mockResolvedValueOnce({ kind: "system_role_immutable" });
        vi.mocked(repository.deleteCustomRole).mockResolvedValueOnce({ kind: "role_in_use" });
        const service = new RoleManagementV2Service({ repository });

        await expect(service.updateRole(globalRoleManager, 1, {
            name: "Different name",
        })).resolves.toEqual({ kind: "system_role_immutable" });
        await expect(service.deleteRole(globalRoleManager, 101)).resolves.toEqual({ kind: "role_in_use" });
    });
});
