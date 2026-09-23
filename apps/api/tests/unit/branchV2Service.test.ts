import { describe, expect, it, vi } from "vitest";
import {
    BranchV2Service,
    type BranchPage,
    type BranchProfile,
    type BranchV2Repository,
} from "../../src/modules/identity-access/application/branch-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const branch: BranchProfile = {
    id: serializeEntityId("9007199254740994"),
    code: "BRANCH_HANOI",
    name: "HappyShop Hà Nội",
    address: "1 Phố Huế, Hà Nội",
    phone: "0912345678",
    email: "hanoi@example.test",
    type: "branch",
    managerEmployeeId: null,
};

const globalBranchManager: V2AccessContext = {
    accountId: serializeEntityId("9007199254740993"),
    customerId: null,
    employeeId: null,
    grants: [{
        roleCode: "SUPER_ADMIN",
        scope: { type: "global" },
        permissions: ["branch.read", "branch.manage.global"],
    }],
};

const branchPage: BranchPage = {
    branches: [branch],
    page: 1,
    limit: 20,
    totalItems: 1,
    totalPages: 1,
};

const createRepository = (): BranchV2Repository => ({
    findById: vi.fn(async () => branch),
    listBranches: vi.fn(async () => branchPage),
    createBranch: vi.fn(async () => branch),
    updateBranch: vi.fn(async () => branch),
});

describe("BranchV2Service", () => {
    it("normalizes a new branch and keeps its manager pointer outside the generic create path", async () => {
        const repository = createRepository();
        const service = new BranchV2Service({ repository });

        await expect(service.create(globalBranchManager, {
            code: " BRANCH_HANOI ",
            name: " HappyShop Hà Nội ",
            address: " 1 Phố Huế, Hà Nội ",
            phone: " 0912345678 ",
            email: " HANOI@EXAMPLE.TEST ",
            type: "branch",
        })).resolves.toEqual({ kind: "created", branch });

        expect(repository.createBranch).toHaveBeenCalledWith({
            code: "BRANCH_HANOI",
            name: "HappyShop Hà Nội",
            address: "1 Phố Huế, Hà Nội",
            phone: "0912345678",
            email: "hanoi@example.test",
            type: "branch",
        });
    });

    it("requires a global branch-management grant for mutations", async () => {
        const repository = createRepository();
        const service = new BranchV2Service({ repository });
        const branchScopedManager: V2AccessContext = {
            ...globalBranchManager,
            grants: [{
                roleCode: "BRANCH_MANAGER",
                scope: { type: "branch", branchId: branch.id },
                permissions: ["branch.manage.global"],
            }],
        };

        await expect(service.create(branchScopedManager, {
            code: "BRANCH_HCM",
            name: "HappyShop Hồ Chí Minh",
            address: "2 Lê Lợi, Hồ Chí Minh",
        })).resolves.toEqual({ kind: "forbidden" });
        await expect(service.update(branchScopedManager, branch.id, { name: "New branch name" }))
            .resolves.toEqual({ kind: "forbidden" });

        expect(repository.createBranch).not.toHaveBeenCalled();
        expect(repository.updateBranch).not.toHaveBeenCalled();
    });

    it("rejects invalid patches and never permits code or manager changes in generic updates", async () => {
        const repository = createRepository();
        const service = new BranchV2Service({ repository });

        await expect(service.update(globalBranchManager, branch.id, {}))
            .resolves.toEqual({ kind: "invalid_branch_input" });
        await expect(service.update(globalBranchManager, branch.id, { email: "invalid email" }))
            .resolves.toEqual({ kind: "invalid_branch_input" });
        await expect(service.update(globalBranchManager, branch.id, { address: "  3 Lê Lợi, Hồ Chí Minh  " }))
            .resolves.toEqual({ kind: "updated", branch });

        expect(repository.updateBranch).toHaveBeenCalledWith(branch.id, {
            address: "3 Lê Lợi, Hồ Chí Minh",
        });
    });

    it("allows only internal grants to read a bounded branch directory", async () => {
        const repository = createRepository();
        const service = new BranchV2Service({ repository });
        const customerWithErroneousPermission: V2AccessContext = {
            ...globalBranchManager,
            grants: [{
                roleCode: "CUSTOMER",
                scope: { type: "global" },
                permissions: ["branch.read"],
            }],
        };

        await expect(service.list(globalBranchManager)).resolves.toEqual({
            kind: "branches",
            page: branchPage,
        });
        await expect(service.list(globalBranchManager, { page: 2, limit: 50 })).resolves.toEqual({
            kind: "branches",
            page: branchPage,
        });
        await expect(service.list(globalBranchManager, { page: 0, limit: 101 }))
            .resolves.toEqual({ kind: "invalid_branch_input" });
        await expect(service.list(globalBranchManager, { page: "2", limit: 20 }))
            .resolves.toEqual({ kind: "invalid_branch_input" });
        await expect(service.get(customerWithErroneousPermission, branch.id))
            .resolves.toEqual({ kind: "forbidden" });
        expect(repository.listBranches).toHaveBeenLastCalledWith({ page: 2, limit: 50 });
        expect(repository.findById).not.toHaveBeenCalled();
    });
});
