import { describe, expect, it, vi } from "vitest";
import {
    CustomerProfileV2Service,
    type CustomerProfileV2Repository,
} from "../../src/modules/identity-access/application/customer-profile-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const customerContext: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const profile = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    email: "customer@example.test",
    username: "customer",
    fullName: "Original Name",
    phone: "0900000000",
};

const createRepository = (): CustomerProfileV2Repository => ({
    findByAccountAndCustomerId: vi.fn(async () => profile),
    updateOwnProfile: vi.fn(async () => profile),
});

describe("CustomerProfileV2Service", () => {
    it("updates only the authenticated customer's mutable profile fields", async () => {
        const repository = createRepository();
        vi.mocked(repository.updateOwnProfile).mockResolvedValueOnce({
            ...profile,
            username: "renamed-customer",
            fullName: "Updated Name",
            phone: "0912345678",
        });
        const service = new CustomerProfileV2Service({ repository });

        await expect(service.updateOwnProfile(customerContext, {
            username: "  renamed-customer  ",
            fullName: "  Updated Name ",
            phone: " 0912345678 ",
        })).resolves.toEqual({
            kind: "updated",
            profile: {
                ...profile,
                username: "renamed-customer",
                fullName: "Updated Name",
                phone: "0912345678",
            },
        });
        expect(repository.updateOwnProfile).toHaveBeenCalledWith({
            accountId: customerContext.accountId,
            customerId: customerContext.customerId,
            username: "renamed-customer",
            fullName: "Updated Name",
            phone: "0912345678",
        });
    });

    it("rejects a context that has no active customer profile", async () => {
        const repository = createRepository();
        const service = new CustomerProfileV2Service({ repository });

        await expect(service.getOwnProfile({ ...customerContext, customerId: null }))
            .resolves.toEqual({ kind: "customer_profile_required" });
        expect(repository.findByAccountAndCustomerId).not.toHaveBeenCalled();
    });

    it("maps an account username uniqueness conflict without exposing database details", async () => {
        const repository = createRepository();
        vi.mocked(repository.updateOwnProfile).mockResolvedValueOnce({ kind: "username_already_exists" });
        const service = new CustomerProfileV2Service({ repository });

        await expect(service.updateOwnProfile(customerContext, { username: "already-used" }))
            .resolves.toEqual({ kind: "username_already_exists" });
    });
});
