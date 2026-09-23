import { describe, expect, it, vi } from "vitest";
import {
    CatalogProductVariantQueryV2Service,
    type CatalogProductVariantV2Repository,
} from "../../src/modules/catalog/application/catalog-product-variant-query-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const variants = [{
    id: serializeEntityId("9007199254740994"),
    productId: serializeEntityId("9007199254740995"),
    sizeId: serializeEntityId("9007199254740996"),
    sizeName: "42",
}];

const createRepository = (): CatalogProductVariantV2Repository => ({
    listActiveForProduct: vi.fn(async () => variants),
});

describe("CatalogProductVariantQueryV2Service", () => {
    it("returns active selectable variants without inventing inventory", async () => {
        const repository = createRepository();
        const service = new CatalogProductVariantQueryV2Service({ repository });

        await expect(service.listByProductId("9007199254740995")).resolves.toEqual({
            kind: "product_variants",
            variants,
        });
        expect(repository.listActiveForProduct).toHaveBeenCalledWith(serializeEntityId("9007199254740995"));
    });

    it("rejects malformed IDs and maps unavailable or inactive parent products safely", async () => {
        const repository = createRepository();
        const service = new CatalogProductVariantQueryV2Service({ repository });

        await expect(service.listByProductId(42)).resolves.toEqual({ kind: "invalid_product_query" });
        vi.mocked(repository.listActiveForProduct).mockResolvedValueOnce(null);
        await expect(service.listByProductId("9007199254740995")).resolves.toEqual({
            kind: "product_not_found",
        });
        vi.mocked(repository.listActiveForProduct).mockRejectedValueOnce(new Error("database details"));
        await expect(service.listByProductId("9007199254740995")).resolves.toEqual({
            kind: "catalog_unavailable",
        });
    });
});
