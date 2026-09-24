import { describe, expect, it, vi } from "vitest";
import { CatalogVariantCommandV2Service, type CatalogVariantCommandV2Repository } from "../../src/modules/catalog/application/catalog-variant-command-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};

describe("Catalog variant command V2", () => {
    it("rejects invalid IDs, SKU, and branch-only access before persistence", async () => {
        const repository: CatalogVariantCommandV2Repository = {
            create: vi.fn<CatalogVariantCommandV2Repository["create"]>(async () => ({ kind: "variant_conflict" })),
            update: vi.fn<CatalogVariantCommandV2Repository["update"]>(async () => ({ kind: "variant_not_found" })),
            deactivate: vi.fn<CatalogVariantCommandV2Repository["deactivate"]>(async () => ({ kind: "deactivated" })),
        };
        const service = new CatalogVariantCommandV2Service({ repository });
        await expect(service.create(manager, "1", { sizeId: "0", sku: "SKU" }))
            .resolves.toEqual({ kind: "invalid_variant_input" });
        await expect(service.create(manager, "1", { sizeId: "2", sku: " " }))
            .resolves.toEqual({ kind: "invalid_variant_input" });
        await expect(service.update(manager, "1", "2", {})).resolves.toEqual({ kind: "invalid_variant_input" });
        const branchOnly: V2AccessContext = { ...manager, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: "2" }, permissions: ["catalog.manage.global"] }] };
        await expect(service.deactivate(branchOnly, "1", "2")).resolves.toEqual({ kind: "forbidden" });
        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.deactivate).not.toHaveBeenCalled();
    });
});
