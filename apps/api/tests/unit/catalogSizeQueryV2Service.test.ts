import { describe, expect, it, vi } from "vitest";
import {
    CatalogSizeQueryV2Service,
    type CatalogSizePage,
    type CatalogSizeV2Repository,
} from "../../src/modules/catalog/application/catalog-size-query-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const sizePage: CatalogSizePage = {
    sizes: [{ id: serializeEntityId("9007199254740994"), name: "42" }],
    page: 1,
    limit: 20,
    totalItems: 1,
    totalPages: 1,
};

const createRepository = (): CatalogSizeV2Repository => ({
    listSizes: vi.fn(async () => sizePage),
});

describe("CatalogSizeQueryV2Service", () => {
    it("returns a deterministic bounded public size directory", async () => {
        const repository = createRepository();
        const service = new CatalogSizeQueryV2Service({ repository });

        await expect(service.list()).resolves.toEqual({ kind: "sizes", page: sizePage });
        await expect(service.list({ page: 2, limit: 50 })).resolves.toEqual({
            kind: "sizes",
            page: sizePage,
        });
        expect(repository.listSizes).toHaveBeenLastCalledWith({ page: 2, limit: 50 });
    });

    it("rejects malformed pagination and maps persistence failures without exposing internals", async () => {
        const repository = createRepository();
        const service = new CatalogSizeQueryV2Service({ repository });

        await expect(service.list({ page: "2", limit: 20 })).resolves.toEqual({
            kind: "invalid_catalog_query",
        });
        await expect(service.list({ page: 1, limit: 101 })).resolves.toEqual({
            kind: "invalid_catalog_query",
        });
        await expect(service.list({ page: Number.MAX_SAFE_INTEGER, limit: 100 })).resolves.toEqual({
            kind: "invalid_catalog_query",
        });
        vi.mocked(repository.listSizes).mockRejectedValueOnce(new Error("database details"));
        await expect(service.list()).resolves.toEqual({ kind: "catalog_unavailable" });
    });
});
