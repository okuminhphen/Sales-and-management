import { describe, expect, it, vi } from "vitest";
import {
    CatalogBannerQueryV2Service,
    type CatalogBannerPage,
    type CatalogBannerV2Repository,
} from "../../src/modules/catalog/application/catalog-banner-query-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const bannerPage: CatalogBannerPage = {
    banners: [{
        id: serializeEntityId("9007199254740994"),
        name: "Khuyến mãi mùa thu",
        image: { url: "https://res.cloudinary.com/demo/image/upload/banner.jpg" },
        targetUrl: "/products",
    }],
    page: 1,
    limit: 20,
    totalItems: 1,
    totalPages: 1,
};

const createRepository = (): CatalogBannerV2Repository => ({
    listActive: vi.fn(async () => bannerPage),
});

describe("CatalogBannerQueryV2Service", () => {
    it("returns a bounded active banner directory", async () => {
        const repository = createRepository();
        const service = new CatalogBannerQueryV2Service({ repository });

        await expect(service.list()).resolves.toEqual({ kind: "banners", page: bannerPage });
        await expect(service.list({ page: 2, limit: 50 })).resolves.toEqual({
            kind: "banners",
            page: bannerPage,
        });
        expect(repository.listActive).toHaveBeenLastCalledWith({ page: 2, limit: 50 });
    });

    it("rejects malformed pagination and maps persistence failures without exposing internals", async () => {
        const repository = createRepository();
        const service = new CatalogBannerQueryV2Service({ repository });

        await expect(service.list({ page: 0, limit: 20 })).resolves.toEqual({
            kind: "invalid_banner_query",
        });
        await expect(service.list({ page: Number.MAX_SAFE_INTEGER, limit: 100 })).resolves.toEqual({
            kind: "invalid_banner_query",
        });
        vi.mocked(repository.listActive).mockRejectedValueOnce(new Error("database details"));
        await expect(service.list()).resolves.toEqual({ kind: "catalog_unavailable" });
    });
});
