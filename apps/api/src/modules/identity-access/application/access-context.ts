import { serializeEntityId } from "../../../shared/contracts/database-scalars.js";

export type V2RoleScope =
    | { type: "global" }
    | { type: "branch"; branchId: string };

/**
 * Database-derived authorization state. JWT grants are only routing hints;
 * protected operations construct this context from Account/Role data first.
 */
export type V2AccessContext = {
    accountId: string;
    customerId: string | null;
    employeeId: string | null;
    grants: readonly {
        roleCode: string;
        scope: V2RoleScope;
        permissions: readonly string[];
    }[];
};

/** Port used by HTTP adapters and use-cases that need current authorization state. */
export interface V2AccessContextReader {
    findActiveByAccountId: (accountId: string) => Promise<V2AccessContext | null>;
}

const matchesEntityId = (actual: string | null, expected: string): boolean => {
    try {
        return actual !== null
            && serializeEntityId(actual) === serializeEntityId(expected);
    } catch {
        return false;
    }
};

export const hasPermission = (context: V2AccessContext, permission: string): boolean =>
    context.grants.some((grant) => grant.permissions.includes(permission));

/** Global operations must never be authorized by a branch-scoped grant. */
export const hasGlobalPermission = (context: V2AccessContext, permission: string): boolean =>
    context.grants.some(
        (grant) => grant.roleCode !== "CUSTOMER"
            && grant.scope.type === "global" && grant.permissions.includes(permission),
    );

/** A customer role is ownership-scoped, even when its role assignment is GLOBAL. */
export const canAccessCustomer = (
    context: V2AccessContext,
    customerId: string,
): boolean => matchesEntityId(context.customerId, customerId);

/**
 * Authorizes only explicit internal branch/global grants. A CUSTOMER GLOBAL
 * assignment can never satisfy a branch authorization check.
 */
export const canAccessBranch = (
    context: V2AccessContext,
    branchId: string,
    requiredPermission: string,
): boolean => context.grants.some((grant) => {
    if (!grant.permissions.includes(requiredPermission)) return false;

    if (grant.scope.type === "branch") {
        return grant.roleCode !== "CUSTOMER" && requiredPermission.endsWith(".branch")
            && matchesEntityId(grant.scope.branchId, branchId);
    }

    return grant.roleCode !== "CUSTOMER" && requiredPermission.endsWith(".global");
});
