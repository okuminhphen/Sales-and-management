import type { AccessTokenClaims } from "../security/access-token.js";

declare module "express-serve-static-core" {
    interface Request {
        user?: AccessTokenClaims & { id?: number };
        requestId?: string;
    }
}

export {};
