import { describe, expect, it, vi } from "vitest";
import { AccountPasswordV2Service, type AccountPasswordV2Repository } from "../../src/modules/identity-access/application/account-password-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import type { PasswordHasher } from "../../src/modules/identity-access/application/password-hasher.js";

const context = { accountId: "7", customerId: "8", employeeId: null, grants: [] } as unknown as V2AccessContext;
const setup = () => {
    const repository: AccountPasswordV2Repository = {
        getActivePasswordHash: vi.fn(async () => "old-hash"),
        replacePasswordHash: vi.fn(async () => true),
    };
    const hasher: PasswordHasher = {
        compare: vi.fn(async (plain, hash) => plain === "current" && hash === "old-hash"),
        hash: vi.fn(async () => "new-hash"),
    };
    return { repository, hasher, service: new AccountPasswordV2Service({ repository, passwordHasher: hasher }) };
};

describe("AccountPasswordV2Service", () => {
    it("changes only the authenticated account password with compare-and-swap", async () => {
        const { service, repository } = setup();
        await expect(service.changeOwnPassword(context, "current", "new-secret")).resolves.toEqual({ kind: "password_changed" });
        expect(repository.replacePasswordHash).toHaveBeenCalledWith({ accountId: "7", expectedHash: "old-hash", nextHash: "new-hash" });
    });

    it("does not hash or write when the current password is wrong", async () => {
        const { service, repository, hasher } = setup();
        await expect(service.changeOwnPassword(context, "wrong", "new-secret")).resolves.toEqual({ kind: "invalid_current_password" });
        expect(hasher.hash).not.toHaveBeenCalled();
        expect(repository.replacePasswordHash).not.toHaveBeenCalled();
    });
});
