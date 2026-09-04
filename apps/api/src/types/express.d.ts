import type { AccessTokenClaims } from "../security/access-token.js";

declare global {
    namespace Express {
        interface Request {
            user?: AccessTokenClaims & { id?: number };
        }
    }
}

export {};
