import type { V2AccessContext } from "../../identity-access/application/access-context.js";

/** SUPER_ADMIN may legitimately have no employee profile; CUSTOMER grants never confer admin access. */
export const canManageBanners = (context: V2AccessContext): boolean =>
    context.grants.some((grant) => grant.roleCode !== "CUSTOMER"
        && grant.scope.type === "global"
        && grant.permissions.includes("catalog.manage.global"));
