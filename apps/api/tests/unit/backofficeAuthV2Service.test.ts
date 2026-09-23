import { describe, expect, it, vi } from "vitest";
import {
    BackofficeAuthV2Service,
    type BackofficeAuthV2Repository,
} from "../../src/modules/identity-access/application/backoffice-auth-v2.service.js";
import type {
    V2AccessContext,
    V2AccessContextReader,
} from "../../src/modules/identity-access/application/access-context.js";
import type { PasswordHasher } from "../../src/modules/identity-access/application/password-hasher.js";

const passwordHasher: PasswordHasher = {
    hash: vi.fn(),
    compare: vi.fn(async (value: string, hash: string) => hash === `hash:${value}`),
};

const createRepository = (): BackofficeAuthV2Repository => ({
    findCredentialByUsername: vi.fn(async () => ({
        accountId: "9007199254740993",
        passwordHash: "hash:correct-password",
        accountStatus: "active" as const,
    })),
    recordSuccessfulLogin: vi.fn(async () => undefined),
});

const createAccessContextReader = (): V2AccessContextReader => ({
    findActiveByAccountId: vi.fn(async (): Promise<V2AccessContext> => ({
        accountId: "9007199254740993",
        customerId: null,
        employeeId: null,
        grants: [{
            roleCode: "SUPER_ADMIN",
            scope: { type: "global" },
            permissions: ["account.manage.global"],
        }],
    })),
});

describe("BackofficeAuthV2Service", () => {
    it("authenticates an active SUPER_ADMIN from database-derived grants", async () => {
        const repository = createRepository();
        const accessContexts = createAccessContextReader();
        const service = new BackofficeAuthV2Service({ repository, accessContexts, passwordHasher });

        await expect(service.login({ username: "root-admin", password: "correct-password" })).resolves.toMatchObject({
            kind: "authenticated",
            context: {
                accountId: "9007199254740993",
                grants: [expect.objectContaining({ roleCode: "SUPER_ADMIN" })],
            },
        });
        expect(repository.recordSuccessfulLogin).toHaveBeenCalledWith("9007199254740993");
    });

    it("rejects a customer-only account even when its password is valid", async () => {
        const repository = createRepository();
        const accessContexts = createAccessContextReader();
        vi.mocked(accessContexts.findActiveByAccountId).mockResolvedValueOnce({
            accountId: "9007199254740993",
            customerId: "9007199254740994",
            employeeId: null,
            grants: [{
                roleCode: "CUSTOMER",
                scope: { type: "global" },
                permissions: ["order.read.own"],
            }],
        } satisfies V2AccessContext);
        const service = new BackofficeAuthV2Service({ repository, accessContexts, passwordHasher });

        await expect(service.login({ username: "customer", password: "correct-password" }))
            .resolves.toEqual({ kind: "invalid_credentials" });
        expect(repository.recordSuccessfulLogin).not.toHaveBeenCalled();
    });

    it("rejects an internal non-super-admin grant without an active employee profile", async () => {
        const repository = createRepository();
        const accessContexts = createAccessContextReader();
        vi.mocked(accessContexts.findActiveByAccountId).mockResolvedValueOnce({
            accountId: "9007199254740993",
            customerId: null,
            employeeId: null,
            grants: [{
                roleCode: "BRANCH_MANAGER",
                scope: { type: "branch", branchId: "9007199254740994" },
                permissions: ["branch.read"],
            }],
        } satisfies V2AccessContext);
        const service = new BackofficeAuthV2Service({ repository, accessContexts, passwordHasher });

        await expect(service.login({ username: "manager", password: "correct-password" }))
            .resolves.toEqual({ kind: "invalid_credentials" });
    });
});
