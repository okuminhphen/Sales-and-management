import { describe, expect, it, vi } from "vitest";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import {
    CatalogBannerCommandV2Service,
    type CatalogBannerCommandV2Repository,
    type CatalogBannerCommandDependencies,
} from "../../src/modules/catalog/application/catalog-banner-command-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";
import type { CatalogMediaProvider } from "../../src/modules/catalog/application/catalog-media-provider.js";
import type { CatalogMediaCleanupLog } from "../../src/modules/catalog/application/catalog-media-cleanup-log.js";

const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};
const customer: V2AccessContext = {
    accountId: "3", customerId: "4", employeeId: null, grants: [],
};

const noopMedia: CatalogMediaProvider = {
    upload: vi.fn(async () => ({ kind: "uploaded" as const, asset: { url: "https://example.com/img.jpg", publicId: "banners/test" } })),
    delete: vi.fn(async () => ({ kind: "deleted" as const })),
};
const noopCleanup: CatalogMediaCleanupLog = { recordFailedCleanup: vi.fn() };

const repository = (): CatalogBannerCommandV2Repository => ({
    reserveUpload: vi.fn(async () => {}),
    create: vi.fn(async () => ({ kind: "created" as const, bannerId: serializeEntityId("7") })),
    update: vi.fn(async () => ({ kind: "updated" as const })),
    deleteWithoutMedia: vi.fn(async () => ({ kind: "deleted" as const })),
    setImage: vi.fn(async () => ({ kind: "image_set" as const, oldPublicId: null })),
    clearImageAndDelete: vi.fn(async () => ({ kind: "deleted" as const, oldPublicId: null })),
});

const deps = (repo: CatalogBannerCommandV2Repository): CatalogBannerCommandDependencies => ({
    repository: repo,
    mediaProvider: noopMedia,
    cleanupLog: noopCleanup,
});

describe("CatalogBannerCommandV2Service", () => {
    it("requires a DB-derived global catalog permission before mutation", async () => {
        const data = repository();
        const service = new CatalogBannerCommandV2Service(deps(data));
        await expect(service.create(customer, { name: "Sale", status: "active" }))
            .resolves.toEqual({ kind: "forbidden" });
        await expect(service.create({ ...customer, grants: [{
            roleCode: "CUSTOMER", scope: { type: "global" }, permissions: ["catalog.manage.global"],
        }] }, {
            name: "Sale", status: "active",
        })).resolves.toEqual({ kind: "forbidden" });
        await expect(service.update(customer, "7", { name: "Sale" }))
            .resolves.toEqual({ kind: "forbidden" });
        await expect(service.delete(customer, "7"))
            .resolves.toEqual({ kind: "forbidden" });
        expect(data.create).not.toHaveBeenCalled();
        expect(data.update).not.toHaveBeenCalled();
        expect(data.clearImageAndDelete).not.toHaveBeenCalled();
    });

    it("normalizes metadata and never accepts an untrusted media object", async () => {
        const data = repository();
        const service = new CatalogBannerCommandV2Service(deps(data));
        await expect(service.create(manager, {
            name: "  Khuyến mãi  ", status: "draft", targetUrl: " /products ",
        })).resolves.toEqual({ kind: "created", bannerId: "7" });
        expect(data.create).toHaveBeenCalledWith({
            name: "Khuyến mãi", status: "draft", targetUrl: "/products",
        });
        await expect(service.create(manager, {
            name: "Sale", status: "active", image: { url: "https://attacker.example/evil.jpg" },
        })).resolves.toEqual({ kind: "invalid_banner" });
    });

    it("rejects invalid names, target URLs, status, IDs and empty updates", async () => {
        const data = repository();
        const service = new CatalogBannerCommandV2Service(deps(data));
        for (const input of [
            { name: "", status: "active" },
            { name: "x".repeat(256), status: "active" },
            { name: "Sale", status: "hidden" },
            { name: "Sale", status: "active", targetUrl: "javascript:alert(1)" },
        ]) {
            await expect(service.create(manager, input)).resolves.toEqual({ kind: "invalid_banner" });
        }
        await expect(service.update(manager, 7, { name: "Sale" }))
            .resolves.toEqual({ kind: "invalid_banner" });
        await expect(service.update(manager, "7", {}))
            .resolves.toEqual({ kind: "invalid_banner" });
        await expect(service.delete(manager, "0"))
            .resolves.toEqual({ kind: "invalid_banner" });
        expect(data.create).not.toHaveBeenCalled();
        expect(data.update).not.toHaveBeenCalled();
        expect(data.clearImageAndDelete).not.toHaveBeenCalled();
    });

    it("propagates safe business outcomes but hides database details", async () => {
        const data = repository();
        vi.mocked(data.clearImageAndDelete).mockResolvedValueOnce({ kind: "banner_not_found" });
        vi.mocked(data.update).mockResolvedValueOnce({ kind: "banner_not_found" });
        vi.mocked(data.create).mockRejectedValueOnce(new Error("SQL detail"));
        const service = new CatalogBannerCommandV2Service(deps(data));
        await expect(service.delete(manager, "7")).resolves.toEqual({ kind: "banner_not_found" });
        await expect(service.update(manager, "7", { name: "Sale" }))
            .resolves.toEqual({ kind: "banner_not_found" });
        await expect(service.create(manager, { name: "Sale", status: "active" }))
            .resolves.toEqual({ kind: "catalog_unavailable" });
    });
});
