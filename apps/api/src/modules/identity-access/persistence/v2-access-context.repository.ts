import { Op } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeEntityId } from "../../../shared/contracts/database-scalars.js";
import type { V2AccessContext, V2RoleScope } from "../application/access-context.js";
import type {
    AccountAttributes,
    AccountRoleAttributes,
    CustomerAttributes,
    EmployeeAttributes,
    PermissionAttributes,
    RoleAttributes,
    RolePermissionAttributes,
} from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

const buildScope = (assignment: AccountRoleAttributes): V2RoleScope | null => {
    if (
        assignment.scopeType === "global"
        && assignment.scopeKey === "GLOBAL"
        && assignment.branchId === null
    ) return { type: "global" };

    if (assignment.scopeType !== "branch" || assignment.branchId === null) return null;

    const branchId = serializeEntityId(assignment.branchId);
    return assignment.scopeKey === `BRANCH:${branchId}`
        ? { type: "branch", branchId }
        : null;
};

/**
 * Rebuilds authorization state from active V2 tables for every protected request.
 * It does not trust a browser-supplied role or the role-grant hints in a JWT.
 */
export class SequelizeV2AccessContextRepository {
    private readonly account: IdentityAccessModel<AccountAttributes>;
    private readonly accountRole: IdentityAccessModel<AccountRoleAttributes>;
    private readonly customer: IdentityAccessModel<CustomerAttributes>;
    private readonly employee: IdentityAccessModel<EmployeeAttributes>;
    private readonly permission: IdentityAccessModel<PermissionAttributes>;
    private readonly role: IdentityAccessModel<RoleAttributes>;
    private readonly rolePermission: IdentityAccessModel<RolePermissionAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
        this.accountRole = getIdentityAccessModel<AccountRoleAttributes>(persistence, "AccountRole");
        this.customer = getIdentityAccessModel<CustomerAttributes>(persistence, "Customer");
        this.employee = getIdentityAccessModel<EmployeeAttributes>(persistence, "Employee");
        this.permission = getIdentityAccessModel<PermissionAttributes>(persistence, "Permission");
        this.role = getIdentityAccessModel<RoleAttributes>(persistence, "Role");
        this.rolePermission = getIdentityAccessModel<RolePermissionAttributes>(persistence, "RolePermission");
    }

    async findActiveByAccountId(rawAccountId: string): Promise<V2AccessContext | null> {
        let accountId: string;
        try {
            accountId = serializeEntityId(rawAccountId);
        } catch {
            return null;
        }

        const account = await this.account.findByPk(accountId);
        if (!account || account.dataValues.status !== "active") return null;

        const [customer, employee, assignments] = await Promise.all([
            this.customer.findOne({ where: { accountId, status: "active" } }),
            this.employee.findOne({ where: { accountId, status: "active" } }),
            this.accountRole.findAll({ where: { accountId }, order: [["id", "ASC"]] }),
        ]);
        if (assignments.length === 0) return null;

        const roleIds = [...new Set(assignments.map((assignment) => assignment.dataValues.roleId))];
        const [roles, rolePermissions] = await Promise.all([
            this.role.findAll({ where: { id: { [Op.in]: roleIds } } }),
            this.rolePermission.findAll({ where: { roleId: { [Op.in]: roleIds } } }),
        ]);
        if (roles.length !== roleIds.length) return null;

        const permissionIds = [...new Set(rolePermissions.map((assignment) => assignment.dataValues.permissionId))];
        const permissions = permissionIds.length === 0
            ? []
            : await this.permission.findAll({ where: { id: { [Op.in]: permissionIds } } });
        if (permissions.length !== permissionIds.length) return null;

        const roleById = new Map(roles.map((role) => [role.dataValues.id, role.dataValues]));
        const permissionById = new Map(permissions.map((permission) => [permission.dataValues.id, permission.dataValues.code]));
        const permissionsByRoleId = new Map<number, string[]>();
        for (const assignment of rolePermissions) {
            const roleId = assignment.dataValues.roleId;
            const permissionCode = permissionById.get(assignment.dataValues.permissionId);
            if (!permissionCode) return null;
            const rolePermissionsForRole = permissionsByRoleId.get(roleId) ?? [];
            rolePermissionsForRole.push(permissionCode);
            permissionsByRoleId.set(roleId, rolePermissionsForRole);
        }

        const grants: V2AccessContext["grants"][number][] = [];
        for (const assignment of assignments) {
            const role = roleById.get(assignment.dataValues.roleId);
            const scope = buildScope(assignment.dataValues);
            if (!role || !scope) return null;

            // Role rows may survive profile deactivation. Revoke their effective
            // privileges immediately, including tokens issued before deactivation.
            // Only the bootstrap global SUPER_ADMIN can operate without HR data.
            if (role.code === "CUSTOMER") {
                if (!customer || scope.type !== "global") continue;
            } else if (!(role.code === "SUPER_ADMIN" && scope.type === "global") && !employee) {
                continue;
            }

            grants.push({
                roleCode: role.code,
                scope,
                permissions: [...(permissionsByRoleId.get(role.id) ?? [])].sort(),
            });
        }

        if (grants.length === 0) return null;
        return {
            accountId,
            customerId: customer ? serializeEntityId(customer.dataValues.id) : null,
            employeeId: employee ? serializeEntityId(employee.dataValues.id) : null,
            grants: grants.sort((left, right) => {
                const leftScope = left.scope.type === "global" ? "GLOBAL" : `BRANCH:${left.scope.branchId}`;
                const rightScope = right.scope.type === "global" ? "GLOBAL" : `BRANCH:${right.scope.branchId}`;
                return `${left.roleCode}:${leftScope}`.localeCompare(`${right.roleCode}:${rightScope}`);
            }),
        };
    }
}
