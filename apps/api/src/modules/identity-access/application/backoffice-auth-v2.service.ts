import { logger } from "../../../observability/logger.js";
import type { V2AccessContext } from "./access-context.js";
import { PASSWORD_TIMING_HASH, type PasswordHasher } from "./password-hasher.js";

type BackofficeAccountStatus = "pending" | "active" | "locked" | "inactive";

export type BackofficeCredential = {
    accountId: string;
    passwordHash: string | null;
    accountStatus: BackofficeAccountStatus;
};

/** Port for the minimal credential reads and audit update required by login. */
export interface BackofficeAuthV2Repository {
    findCredentialByUsername: (username: string) => Promise<BackofficeCredential | null>;
    recordSuccessfulLogin: (accountId: string) => Promise<void>;
}

/** Authorization must always be rebuilt from active V2 database records. */
export interface V2AccessContextReader {
    findActiveByAccountId: (accountId: string) => Promise<V2AccessContext | null>;
}

export type BackofficeLoginInput = {
    username: string;
    password: string;
};

export type BackofficeLoginResult =
    | { kind: "authenticated"; context: V2AccessContext }
    | { kind: "invalid_credentials" }
    | { kind: "authentication_unavailable" };

const isBackofficeContext = (context: V2AccessContext): boolean => {
    const internalGrants = context.grants.filter((grant) => grant.roleCode !== "CUSTOMER");
    if (internalGrants.length === 0) return false;

    // An active employee is mandatory for every scoped internal role. The one
    // bootstrap exception is the global SUPER_ADMIN seeded before HR data exists.
    return internalGrants.some((grant) => (
        grant.roleCode === "SUPER_ADMIN" && grant.scope.type === "global"
    )) || context.employeeId !== null;
};

/**
 * Backoffice password authentication. It intentionally returns a generic
 * credential failure for unknown, inactive and unauthorized accounts, and
 * never lets a CUSTOMER assignment enter an internal session.
 */
export class BackofficeAuthV2Service {
    constructor(
        private readonly dependencies: {
            repository: BackofficeAuthV2Repository;
            accessContexts: V2AccessContextReader;
            passwordHasher: PasswordHasher;
        },
    ) {}

    async login(input: BackofficeLoginInput): Promise<BackofficeLoginResult> {
        let credential: BackofficeCredential | null;
        try {
            credential = await this.dependencies.repository.findCredentialByUsername(input.username.trim());
        } catch (error) {
            this.logUnavailable("credential_lookup", error);
            return { kind: "authentication_unavailable" };
        }

        let passwordMatches: boolean;
        try {
            passwordMatches = await this.dependencies.passwordHasher.compare(
                input.password,
                credential?.passwordHash ?? PASSWORD_TIMING_HASH,
            );
        } catch (error) {
            this.logUnavailable("password_compare", error);
            return { kind: "authentication_unavailable" };
        }

        if (!credential || credential.accountStatus !== "active" || !credential.passwordHash || !passwordMatches) {
            return { kind: "invalid_credentials" };
        }

        let context: V2AccessContext | null;
        try {
            context = await this.dependencies.accessContexts.findActiveByAccountId(credential.accountId);
        } catch (error) {
            this.logUnavailable("access_context", error);
            return { kind: "authentication_unavailable" };
        }
        if (!context || !isBackofficeContext(context)) return { kind: "invalid_credentials" };

        try {
            await this.dependencies.repository.recordSuccessfulLogin(credential.accountId);
        } catch {
            // The credential and active authorization context are authoritative;
            // a best-effort audit timestamp must not turn a valid login into a failure.
        }

        return { kind: "authenticated", context };
    }

    private logUnavailable(operation: string, error: unknown): void {
        logger.error("backoffice_auth_v2.authentication_unavailable", {
            operation,
            errorName: error instanceof Error ? error.name : "UnknownError",
        });
    }
}
