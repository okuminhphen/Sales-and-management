import { describe, expect, it, vi } from "vitest";
import {
    CustomerAuthV2Service,
    type CustomerAuthV2Repository,
    type PasswordHasher,
    type VerificationTokenGateway,
} from "../../src/modules/identity-access/application/customer-auth-v2.service.js";

const passwordHasher: PasswordHasher = {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    compare: vi.fn(async (value: string, hash: string) => hash === `hash:${value}`),
};

const createVerificationGateway = (): VerificationTokenGateway => ({
    claim: vi.fn(async () => ({ success: true } as const)),
    release: vi.fn(async () => true),
    finalize: vi.fn(async () => true),
});

const createRepository = (): CustomerAuthV2Repository => ({
    registerVerifiedCustomer: vi.fn(async () => ({
        kind: "created" as const,
        accountId: "9007199254740993",
        customerId: "9007199254740994",
    })),
    findCredentialByEmailOrPhone: vi.fn(async () => null),
    recordSuccessfulLogin: vi.fn(async () => undefined),
});

describe("CustomerAuthV2Service", () => {
    it("claims the normalized-email OTP before creating an Account/Customer and finalizes it only after commit", async () => {
        const verificationGateway = createVerificationGateway();
        const repository = createRepository();
        const service = new CustomerAuthV2Service({ repository, verificationGateway, passwordHasher });

        const result = await service.register({
            email: "  Mai.Nguyen@Example.Test ",
            phone: "0901234567",
            username: "Mai Nguyen",
            password: "password123",
            emailVerificationToken: "verification-token",
        });

        expect(result).toEqual({
            kind: "registered",
            accountId: "9007199254740993",
            customerId: "9007199254740994",
        });
        expect(verificationGateway.claim).toHaveBeenCalledWith("verification-token", "mai.nguyen@example.test");
        expect(repository.registerVerifiedCustomer).toHaveBeenCalledWith({
            email: "mai.nguyen@example.test",
            phone: "0901234567",
            username: "Mai Nguyen",
            passwordHash: "hash:password123",
        });
        expect(verificationGateway.finalize).toHaveBeenCalledWith("verification-token");
        expect(verificationGateway.release).not.toHaveBeenCalled();
    });

    it("releases a claimed OTP when the database rejects a duplicate email", async () => {
        const verificationGateway = createVerificationGateway();
        const repository = createRepository();
        vi.mocked(repository.registerVerifiedCustomer).mockResolvedValueOnce({ kind: "email_already_exists" });
        const service = new CustomerAuthV2Service({ repository, verificationGateway, passwordHasher });

        const result = await service.register({
            email: "customer@example.test",
            phone: "0901234567",
            username: "customer",
            password: "password123",
            emailVerificationToken: "verification-token",
        });

        expect(result).toEqual({ kind: "email_already_exists" });
        expect(verificationGateway.release).toHaveBeenCalledWith("verification-token");
        expect(verificationGateway.finalize).not.toHaveBeenCalled();
    });

    it("returns one opaque failure for wrong password and inactive account", async () => {
        const verificationGateway = createVerificationGateway();
        const repository = createRepository();
        vi.mocked(repository.findCredentialByEmailOrPhone)
            .mockResolvedValueOnce({
                accountId: "9007199254740993",
                customerId: "9007199254740994",
                email: "customer@example.test",
                passwordHash: "hash:wrong-password",
                accountStatus: "active",
                customerStatus: "active",
                role: { code: "CUSTOMER", name: "Khách hàng" },
            })
            .mockResolvedValueOnce({
                accountId: "9007199254740993",
                customerId: "9007199254740994",
                email: "customer@example.test",
                passwordHash: "hash:password123",
                accountStatus: "locked",
                customerStatus: "active",
                role: { code: "CUSTOMER", name: "Khách hàng" },
            });
        const service = new CustomerAuthV2Service({ repository, verificationGateway, passwordHasher });

        await expect(service.login({ emailOrPhone: "customer@example.test", password: "password123" }))
            .resolves.toEqual({ kind: "invalid_credentials" });
        await expect(service.login({ emailOrPhone: "customer@example.test", password: "password123" }))
            .resolves.toEqual({ kind: "invalid_credentials" });
        expect(repository.recordSuccessfulLogin).not.toHaveBeenCalled();
    });
});
