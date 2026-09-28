import { describe, expect, it, vi } from "vitest";
import { CatalogProductCommandV2Service, type CatalogProductCommandV2Repository } from "../../src/modules/catalog/application/catalog-product-command-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};

describe("Catalog product command V2", () => {
    it("allows an authorized compatibility client to explicitly publish a new product", async () => {
        const repository: CatalogProductCommandV2Repository = {
            create: vi.fn<CatalogProductCommandV2Repository["create"]>(async () => ({
                kind: "created", id: serializeEntityId("9"),
            })),
            update: vi.fn<CatalogProductCommandV2Repository["update"]>(async () => ({ kind: "product_not_found" })),
            deactivate: vi.fn<CatalogProductCommandV2Repository["deactivate"]>(async () => ({ kind: "deactivated" })),
        };
        const service = new CatalogProductCommandV2Service({ repository });

        await expect(service.create(manager, {
            name: "Shoes", price: "250000.0000", categoryId: "1", status: "active",
        })).resolves.toEqual({ kind: "created", id: "9" });
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    });

    it("rejects number money and branch-only grants before persistence", async () => {
        const repository: CatalogProductCommandV2Repository = {
            create: vi.fn<CatalogProductCommandV2Repository["create"]>(async () => ({ kind: "category_not_found" })),
            update: vi.fn<CatalogProductCommandV2Repository["update"]>(async () => ({ kind: "product_not_found" })),
            deactivate: vi.fn<CatalogProductCommandV2Repository["deactivate"]>(async () => ({ kind: "deactivated" })),
        };
        const service = new CatalogProductCommandV2Service({ repository });
        await expect(service.create(manager, { name: "Shoes", price: 2.5 as unknown as string, categoryId: "1" }))
            .resolves.toEqual({ kind: "invalid_product_input" });
        await expect(service.create(manager, { name: "Shoes", price: "1.00000", categoryId: "1" }))
            .resolves.toEqual({ kind: "invalid_product_input" });
        await expect(service.update(manager, "1", { price: "9999999999999999" }))
            .resolves.toEqual({ kind: "invalid_product_input" });
        const branchOnly: V2AccessContext = { ...manager, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: "2" }, permissions: ["catalog.manage.global"] }] };
        await expect(service.deactivate(branchOnly, "1")).resolves.toEqual({ kind: "forbidden" });
        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.deactivate).not.toHaveBeenCalled();
    });
});
