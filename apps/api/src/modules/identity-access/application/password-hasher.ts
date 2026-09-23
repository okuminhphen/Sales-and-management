import bcrypt from "bcryptjs";

/**
 * Password work is isolated behind a port so authentication use-cases do not
 * depend on bcrypt and can be tested without an expensive hash implementation.
 */
export interface PasswordHasher {
    hash: (password: string) => Promise<string>;
    compare: (password: string, passwordHash: string) => Promise<boolean>;
}

export const bcryptPasswordHasher: PasswordHasher = {
    hash: async (password) => bcrypt.hash(password, 12),
    compare: async (password, passwordHash) => bcrypt.compare(password, passwordHash),
};

// A valid non-secret bcrypt value used for an equivalent password comparison
// when a credential is unknown, disabled, or passwordless. It is not usable as
// an account credential.
export const PASSWORD_TIMING_HASH = "$2b$12$75xwIK3SpomlWW7XQNMOZOAGXr3wJc2hQmJ8f/24eimgflwba8cKC";
