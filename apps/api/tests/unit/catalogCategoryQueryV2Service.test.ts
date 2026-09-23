import { describe, expect, it, vi } from "vitest";
import {
    CatalogCategoryQueryV2Service,
    type CatalogCategoryPage,
    type CatalogCategoryV2Repository,
} from "../../src/modules/catalog/application/catalog-category-query-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const category = {
    id: serializeEntityId("9007199254740994"),
    parentId: null,
    code: "SNEAKERS",
    name: "Giày thể thao",
    slug: "giay-the-thao",
    description: "Danh mục giày thể thao",
};

const categoryPage: CatalogCategoryPage = {
    categories: [category],
    page: 1,
    limit: 20,
    totalItems: 1,
    totalPages: 1,
};

const createRepository = (): CatalogCategoryV2Repository => ({
    listCategories: vi.fn(async () => categoryPage),
});

describe("CatalogCategoryQueryV2Service", () => {
    it("returns a deterministic bounded public category directory", async () => {
        const repository = createRepository();
        const service = new CatalogCategoryQueryV2Service({ repository });

        await expect(service.list()).resolves.toEqual({ kind: "categories", page: categoryPage });
        await expect(service.list({ page: 2, limit: 50 })).resolves.toEqual({
            kind: "categories",
            page: categoryPage,
        });
        expect(repository.listCategories).toHaveBeenLastCalledWith({ page: 2, limit: 50 });
    });

    it("rejects malformed pagination and maps persistence failures without exposing internals", async () => {
        const repository = createRepository();
        const service = new CatalogCategoryQueryV2Service({ repository });

        await expect(service.list({ page: "2", limit: 20 })).resolves.toEqual({
            kind: "invalid_catalog_query",
        });
        await expect(service.list({ page: Number.MAX_SAFE_INTEGER, limit: 100 })).resolves.toEqual({
            kind: "invalid_catalog_query",
        });
        vi.mocked(repository.listCategories).mockRejectedValueOnce(new Error("database details"));
        await expect(service.list()).resolves.toEqual({ kind: "catalog_unavailable" });
    });
});
