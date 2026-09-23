import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { serializeEntityId, type EntityId } from "../shared/contracts/database-scalars.js";

const JWT_ISSUER = "sales-and-management-api";
const JWT_AUDIENCE = "sales-and-management-web";

const entityIdSchema = z.string().transform((value, context): EntityId => {
    try {
        return serializeEntityId(value);
    } catch (error) {
        context.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : "Entity ID is invalid.",
        });
        return z.NEVER;
    }
});

const branchScopeSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("global") }),
    z.object({ type: z.literal("branch"), branchId: entityIdSchema }),
]);

const roleGrantClaimSchema = z.object({
    roleCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,99}$/),
    scope: branchScopeSchema,
});

export const v2AccessTokenClaimsSchema = z.object({
    version: z.literal(2),
    accountId: entityIdSchema,
    customerId: entityIdSchema.nullable(),
    employeeId: entityIdSchema.nullable(),
    roleGrants: z.array(roleGrantClaimSchema).min(1),
}).superRefine((claims, context) => {
    const grantKeys = new Set<string>();
    for (const grant of claims.roleGrants) {
        const scopeKey = grant.scope.type === "global"
            ? "GLOBAL"
            : `BRANCH:${grant.scope.branchId}`;
        const grantKey = `${grant.roleCode}:${scopeKey}`;
        if (grantKeys.has(grantKey)) {
            context.addIssue({
                code: "custom",
                path: ["roleGrants"],
                message: "Role grants must not contain the same role and scope more than once.",
            });
            return;
        }
        grantKeys.add(grantKey);
    }
});

export type V2AccessTokenClaims = z.infer<typeof v2AccessTokenClaimsSchema>;
export type V2AccessTokenInput = z.input<typeof v2AccessTokenClaimsSchema>;

export const signV2AccessToken = (claims: V2AccessTokenInput): string =>
    jwt.sign(v2AccessTokenClaimsSchema.parse(claims), env.JWT_SECRET, {
        expiresIn: "15m",
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    });

export const verifyV2AccessToken = (token: string): V2AccessTokenClaims =>
    v2AccessTokenClaimsSchema.parse(jwt.verify(token, env.JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    }));
