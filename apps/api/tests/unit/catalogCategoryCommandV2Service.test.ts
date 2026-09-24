import { describe, expect, it, vi } from "vitest";
import { CatalogCategoryCommandV2Service, type CatalogCategoryCommandV2Repository } from "../../src/modules/catalog/application/catalog-category-command-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};
const branchManager: V2AccessContext = {
    ...manager,
    grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "2" },
        permissions: ["catalog.manage.global"] }],
};

describe("Catalog category command V2", () => {
    it("rejects branch-only grants and invalid parent IDs before repository writes", async () => {
        const repository: CatalogCategoryCommandV2Repository = {
            create: vi.fn<CatalogCategoryCommandV2Repository["create"]>(async () => ({ kind: "created", id: serializeEntityId("3") })),
            update: vi.fn<CatalogCategoryCommandV2Repository["update"]>(async () => ({ kind: "updated", id: serializeEntityId("3") })),
            remove: vi.fn<CatalogCategoryCommandV2Repository["remove"]>(async () => ({ kind: "deleted" })),
        };
        const service = new CatalogCategoryCommandV2Service({ repository });
        await expect(service.create(branchManager, { name: "Shoes" })).resolves.toEqual({ kind: "forbidden" });
        await expect(service.create(manager, { name: "Shoes", parentId: "0" }))
            .resolves.toEqual({ kind: "invalid_category_input" });
        await expect(service.update(manager, "3", {})).resolves.toEqual({ kind: "invalid_category_input" });
        await expect(service.remove(manager, "9223372036854775808")).resolves.toEqual({ kind: "invalid_category_input" });
        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.remove).not.toHaveBeenCalled();
    });
});
