import { describe, expect, it, vi } from "vitest";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import {
    CatalogBannerAdminQueryV2Service,
    type CatalogBannerAdminV2Repository,
} from "../../src/modules/catalog/application/catalog-banner-admin-query-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const superAdmin: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};
const page = {
    banners: [{
        id: serializeEntityId("7"), name: "Ẩn", image: null, targetUrl: "/products",
        status: "draft" as const,
    }],
    page: 1, limit: 20, totalItems: 1, totalPages: 1,
};

describe("CatalogBannerAdminQueryV2Service", () => {
    it("lists all statuses for a global catalog manager, including a SUPER_ADMIN without employee", async () => {
        const listAll = vi.fn(async () => page);
        const service = new CatalogBannerAdminQueryV2Service({ repository: { listAll } });
        await expect(service.list(superAdmin)).resolves.toEqual({ kind: "banners", page });
        expect(listAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it("rejects customer grants, branch grants and malformed pagination before querying", async () => {
        const listAll = vi.fn(async () => page);
        const service = new CatalogBannerAdminQueryV2Service({ repository: { listAll } });
        await expect(service.list({ ...superAdmin, grants: [{
            roleCode: "CUSTOMER", scope: { type: "global" }, permissions: ["catalog.manage.global"],
        }] })).resolves.toEqual({ kind: "forbidden" });
        await expect(service.list({ ...superAdmin, grants: [{
            roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "2" },
            permissions: ["catalog.manage.global"],
        }] })).resolves.toEqual({ kind: "forbidden" });
        await expect(service.list(superAdmin, { page: 0 })).resolves.toEqual({ kind: "invalid_banner_query" });
        await expect(service.list(superAdmin, { limit: 101 })).resolves.toEqual({ kind: "invalid_banner_query" });
        expect(listAll).not.toHaveBeenCalled();
    });

    it("does not expose repository failure details", async () => {
        const repository: CatalogBannerAdminV2Repository = {
            listAll: vi.fn(async () => { throw new Error("SQL detail"); }),
        };
        const service = new CatalogBannerAdminQueryV2Service({ repository });
        await expect(service.list(superAdmin)).resolves.toEqual({ kind: "catalog_unavailable" });
    });
});
