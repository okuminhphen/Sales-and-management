import { describe, expect, it, vi } from "vitest";
import { CatalogSizeCommandV2Service, type CatalogSizeCommandV2Repository } from "../../src/modules/catalog/application/catalog-size-command-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};

describe("Catalog size command V2", () => {
    it("rejects invalid names and IDs without issuing writes", async () => {
        const repository: CatalogSizeCommandV2Repository = {
            create: vi.fn<CatalogSizeCommandV2Repository["create"]>(async () => ({ kind: "size_name_conflict" })),
            update: vi.fn<CatalogSizeCommandV2Repository["update"]>(async () => ({ kind: "size_not_found" })),
            remove: vi.fn<CatalogSizeCommandV2Repository["remove"]>(async () => ({ kind: "size_in_use" })),
        };
        const service = new CatalogSizeCommandV2Service({ repository });
        await expect(service.create(manager, " ")).resolves.toEqual({ kind: "invalid_size_input" });
        await expect(service.update(manager, "invalid", "M")).resolves.toEqual({ kind: "invalid_size_input" });
        await expect(service.remove(manager, "9223372036854775808")).resolves.toEqual({ kind: "invalid_size_input" });
        await expect(service.create({ ...manager, grants: [] }, "M")).resolves.toEqual({ kind: "forbidden" });
        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.remove).not.toHaveBeenCalled();
    });
});
