import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../../../../observability/logger.js";
import {
    type V2AccessContext,
    type V2AccessContextReader,
} from "../../application/access-context.js";
import {
    verifyV2AccessToken,
    type V2AccessTokenClaims,
} from "../../../../security/v2-access-token.js";

export type V2AuthenticatedRequest = Request & { v2AccessContext?: V2AccessContext };

type V2TokenVerifier = (token: string) => V2AccessTokenClaims;

const unauthenticated = (response: Response): void => {
    response.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
};

const readBearerToken = (request: Request): string | null => {
    const authorization = request.header("authorization");
    if (!authorization) return null;

    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
    return match?.[1] ?? null;
};

/**
 * Fail-closed V2 request boundary. Claims only identify the account; role,
 * customer and employee state are re-derived from active database records.
 */
export const createV2AuthMiddleware = (dependencies: {
    accessContexts: V2AccessContextReader;
    verifyToken?: V2TokenVerifier;
}): RequestHandler => {
    const verifyToken = dependencies.verifyToken ?? verifyV2AccessToken;

    return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
        const token = readBearerToken(request);
        if (!token) {
            unauthenticated(response);
            return;
        }

        let claims: V2AccessTokenClaims;
        try {
            claims = verifyToken(token);
        } catch {
            unauthenticated(response);
            return;
        }

        try {
            const context = await dependencies.accessContexts.findActiveByAccountId(claims.accountId);
            if (!context || context.accountId !== claims.accountId) {
                unauthenticated(response);
                return;
            }
            (request as V2AuthenticatedRequest).v2AccessContext = context;
            next();
        } catch (error) {
            logger.error("v2_auth.authorization_context_unavailable", {
                errorName: error instanceof Error ? error.name : "UnknownError",
            });
            response.status(503).json({
                error: {
                    code: "AUTHORIZATION_UNAVAILABLE",
                    message: "Authentication service temporarily unavailable",
                },
            });
        }
    };
};
