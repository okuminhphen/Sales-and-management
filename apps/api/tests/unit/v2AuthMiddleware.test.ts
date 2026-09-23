import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import type { V2AccessTokenClaims } from "../../src/security/v2-access-token.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const claimsForAccount = (): V2AccessTokenClaims => ({
    version: 2,
    accountId: serializeEntityId(context.accountId),
    customerId: serializeEntityId(context.customerId!),
    employeeId: null,
    roleGrants: [{ roleCode: "CUSTOMER", scope: { type: "global" } }],
});

const createResponse = (): Response => {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    return response as unknown as Response;
};

const createRequest = (authorization?: string): Request => ({
    header: vi.fn((name: string) => name === "authorization" ? authorization : undefined),
}) as unknown as Request;

describe("createV2AuthMiddleware", () => {
    it("rejects a missing bearer token before querying authorization state", async () => {
        const accessContexts = { findActiveByAccountId: vi.fn() };
        const middleware = createV2AuthMiddleware({
            verifyToken: vi.fn(),
            accessContexts,
        });
        const response = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(createRequest(), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith({
            error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        });
        expect(accessContexts.findActiveByAccountId).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it("derives the request context from the database instead of trusting stale token grants", async () => {
        const accessContexts = { findActiveByAccountId: vi.fn(async () => context) };
        const verifyToken = vi.fn((): V2AccessTokenClaims => ({
            ...claimsForAccount(),
            customerId: null,
            roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }],
        }));
        const middleware = createV2AuthMiddleware({ verifyToken, accessContexts });
        const request = createRequest("Bearer signed-token");
        const response = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(request, response, next);

        expect(verifyToken).toHaveBeenCalledWith("signed-token");
        expect(accessContexts.findActiveByAccountId).toHaveBeenCalledWith(context.accountId);
        expect((request as Request & { v2AccessContext?: V2AccessContext }).v2AccessContext).toEqual(context);
        expect(next).toHaveBeenCalledOnce();
        expect(response.status).not.toHaveBeenCalled();
    });

    it("rejects a malformed or expired JWT without exposing verifier details", async () => {
        const accessContexts = { findActiveByAccountId: vi.fn() };
        const middleware = createV2AuthMiddleware({
            verifyToken: vi.fn(() => { throw new Error("jwt expired"); }),
            accessContexts,
        });
        const response = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(createRequest("Bearer malformed-token"), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith({
            error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        });
        expect(accessContexts.findActiveByAccountId).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it("fails closed when the account is inactive", async () => {
        const accessContexts = { findActiveByAccountId: vi.fn(async () => null) };
        const middleware = createV2AuthMiddleware({
            verifyToken: vi.fn(claimsForAccount),
            accessContexts,
        });
        const response = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(createRequest("Bearer signed-token"), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith({
            error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("returns a generic 503 when the authorization store cannot be queried", async () => {
        const accessContexts = { findActiveByAccountId: vi.fn(async () => {
            throw new Error("database connection refused");
        }) };
        const middleware = createV2AuthMiddleware({
            verifyToken: vi.fn(claimsForAccount),
            accessContexts,
        });
        const response = createResponse();
        const next = vi.fn() as NextFunction;

        await middleware(createRequest("Bearer signed-token"), response, next);

        expect(response.status).toHaveBeenCalledWith(503);
        expect(response.json).toHaveBeenCalledWith({
            error: {
                code: "AUTHORIZATION_UNAVAILABLE",
                message: "Authentication service temporarily unavailable",
            },
        });
        expect(next).not.toHaveBeenCalled();
    });
});
