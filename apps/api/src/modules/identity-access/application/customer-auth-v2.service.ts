import { logger } from "../../../observability/logger.js";
import {
    bcryptPasswordHasher,
    PASSWORD_TIMING_HASH,
    type PasswordHasher,
} from "./password-hasher.js";

export { bcryptPasswordHasher, type PasswordHasher } from "./password-hasher.js";

export type AccountSecurityStatus = "pending" | "active" | "locked" | "inactive";
export type CustomerProfileStatus = "active" | "inactive" | "anonymized";

export type VerificationTokenClaim =
    | { success: true }
    | { success: false; error: "NOT_FOUND" | "EXPIRED" | "EMAIL_MISMATCH" | "ALREADY_CLAIMED" };

/**
 * Adapter port for the short-lived email verification token. The identity-access
 * application layer deliberately does not depend on Redis or the auth HTTP module.
 */
export interface VerificationTokenGateway {
    claim: (token: string, email: string) => Promise<VerificationTokenClaim>;
    release: (token: string) => Promise<boolean>;
    finalize: (token: string) => Promise<boolean>;
}

export type RegisterVerifiedCustomerInput = {
    email: string;
    phone: string;
    username: string;
    passwordHash: string;
};

export type CustomerCredential = {
    accountId: string;
    customerId: string;
    email: string;
    passwordHash: string | null;
    accountStatus: AccountSecurityStatus;
    customerStatus: CustomerProfileStatus;
    role: { code: "CUSTOMER"; name: string };
};

export interface CustomerAuthV2Repository {
    registerVerifiedCustomer: (input: RegisterVerifiedCustomerInput) => Promise<
        | { kind: "created"; accountId: string; customerId: string }
        | { kind: "email_already_exists" }
        | { kind: "username_already_exists" }
    >;
    findCredentialByEmailOrPhone: (identifier: string) => Promise<CustomerCredential | null>;
    recordSuccessfulLogin: (accountId: string) => Promise<void>;
}

export type CustomerRegistrationInput = {
    email: string;
    phone: string;
    username: string;
    password: string;
    emailVerificationToken: string;
};

export type CustomerRegistrationResult =
    | { kind: "registered"; accountId: string; customerId: string }
    | { kind: "email_already_exists" }
    | { kind: "username_already_exists" }
    | { kind: "verification_email_mismatch" }
    | { kind: "verification_already_claimed" }
    | { kind: "verification_invalid" }
    | { kind: "registration_unavailable" };

export type CustomerLoginInput = {
    emailOrPhone: string;
    password: string;
};

export type CustomerLoginResult =
    | {
        kind: "authenticated";
        accountId: string;
        customerId: string;
        email: string;
        role: { code: "CUSTOMER"; name: string };
    }
    | { kind: "invalid_credentials" }
    | { kind: "authentication_unavailable" };

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const normalizeLoginIdentifier = (emailOrPhone: string): string => {
    const identifier = emailOrPhone.trim();
    return identifier.includes("@") ? identifier.toLowerCase() : identifier;
};

export class CustomerAuthV2Service {
    constructor(
        private readonly dependencies: {
            repository: CustomerAuthV2Repository;
            verificationGateway: VerificationTokenGateway;
            passwordHasher: PasswordHasher;
        },
    ) {}

    async register(input: CustomerRegistrationInput): Promise<CustomerRegistrationResult> {
        const email = normalizeEmail(input.email);
        let claim: VerificationTokenClaim;

        try {
            claim = await this.dependencies.verificationGateway.claim(input.emailVerificationToken, email);
        } catch {
            return { kind: "registration_unavailable" };
        }

        if (claim.success === false) {
            switch (claim.error) {
                case "EMAIL_MISMATCH":
                    return { kind: "verification_email_mismatch" };
                case "ALREADY_CLAIMED":
                    return { kind: "verification_already_claimed" };
                default:
                    return { kind: "verification_invalid" };
            }
        }

        try {
            const passwordHash = await this.dependencies.passwordHasher.hash(input.password);
            const created = await this.dependencies.repository.registerVerifiedCustomer({
                email,
                phone: input.phone.trim(),
                username: input.username.trim(),
                passwordHash,
            });

            if (created.kind === "email_already_exists" || created.kind === "username_already_exists") {
                await this.releaseVerificationToken(input.emailVerificationToken);
                return created;
            }

            // Account/Customer/role assignment is committed before the one-time OTP is consumed.
            // A finalize failure is safe to tolerate: the unique account constraint prevents replay,
            // and the short-lived token remains protected by its own TTL.
            await this.finalizeVerificationToken(input.emailVerificationToken);
            return { kind: "registered", accountId: created.accountId, customerId: created.customerId };
        } catch (error) {
            await this.releaseVerificationToken(input.emailVerificationToken);
            logger.error("customer_auth_v2.registration_failed", {
                errorName: error instanceof Error ? error.name : "UnknownError",
            });
            return { kind: "registration_unavailable" };
        }
    }

    async login(input: CustomerLoginInput): Promise<CustomerLoginResult> {
        let credential: CustomerCredential | null;
        try {
            credential = await this.dependencies.repository.findCredentialByEmailOrPhone(
                normalizeLoginIdentifier(input.emailOrPhone),
            );
        } catch {
            return { kind: "authentication_unavailable" };
        }

        let passwordMatches: boolean;
        try {
            passwordMatches = await this.dependencies.passwordHasher.compare(
                input.password,
                credential?.passwordHash ?? PASSWORD_TIMING_HASH,
            );
        } catch {
            return { kind: "authentication_unavailable" };
        }
        if (
            !credential
            || credential.accountStatus !== "active"
            || credential.customerStatus !== "active"
            || !credential.passwordHash
            || !passwordMatches
        ) return { kind: "invalid_credentials" };

        try {
            await this.dependencies.repository.recordSuccessfulLogin(credential.accountId);
        } catch {
            // A successful credential check remains valid if the optional audit timestamp cannot update.
        }

        return {
            kind: "authenticated",
            accountId: credential.accountId,
            customerId: credential.customerId,
            email: credential.email,
            role: credential.role,
        };
    }

    private async releaseVerificationToken(token: string): Promise<void> {
        try {
            await this.dependencies.verificationGateway.release(token);
        } catch {
            // The token has a bounded TTL; do not expose storage failures to callers.
        }
    }

    private async finalizeVerificationToken(token: string): Promise<void> {
        try {
            await this.dependencies.verificationGateway.finalize(token);
        } catch {
            // The database commit is authoritative. See the comment at the call site.
        }
    }
}
