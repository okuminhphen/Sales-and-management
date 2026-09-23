import { describe, expect, it, vi } from "vitest";
import {
    CatalogProductQueryV2Service,
    type CatalogProductPage,
    type CatalogProductV2Repository,
} from "../../src/modules/catalog/application/catalog-product-query-v2.service.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";

const product = {
    id: serializeEntityId("9007199254740994"),
    categoryId: serializeEntityId("9007199254740995"),
    name: "Giày chạy bộ",
    slug: "giay-chay-bo",
    description: "Nhẹ và thoáng khí",
    basePrice: serializeMoney("1299000"),
    images: [{ url: "https://res.cloudinary.com/demo/image/upload/shoe.jpg" }],
};

const productPage: CatalogProductPage = {
    products: [product],
    page: 1,
    limit: 20,
    totalItems: 1,
    totalPages: 1,
};

const createRepository = (): CatalogProductV2Repository => ({
    findActiveById: vi.fn(async () => product),
    listActive: vi.fn(async () => productPage),
});

describe("CatalogProductQueryV2Service", () => {
    it("returns only the active product directory with bounded pagination", async () => {
        const repository = createRepository();
        const service = new CatalogProductQueryV2Service({ repository });

        await expect(service.list()).resolves.toEqual({ kind: "products", page: productPage });
        await expect(service.list({ page: 2, limit: 50 })).resolves.toEqual({
            kind: "products",
            page: productPage,
        });
        expect(repository.listActive).toHaveBeenLastCalledWith({ page: 2, limit: 50 });
    });

    it("validates public input and does not leak persistence errors", async () => {
        const repository = createRepository();
        const service = new CatalogProductQueryV2Service({ repository });

        await expect(service.getById("not-an-id")).resolves.toEqual({ kind: "invalid_product_query" });
        await expect(service.list({ page: 1, limit: 101 })).resolves.toEqual({
            kind: "invalid_product_query",
        });
        await expect(service.list({ page: Number.MAX_SAFE_INTEGER, limit: 100 })).resolves.toEqual({
            kind: "invalid_product_query",
        });
        vi.mocked(repository.findActiveById).mockRejectedValueOnce(new Error("database details"));
        await expect(service.getById("9007199254740994")).resolves.toEqual({
            kind: "catalog_unavailable",
        });
    });

    it("maps a missing or inactive product to the public not-found result", async () => {
        const repository = createRepository();
        vi.mocked(repository.findActiveById).mockResolvedValueOnce(null);
        const service = new CatalogProductQueryV2Service({ repository });

        await expect(service.getById("9007199254740994")).resolves.toEqual({
            kind: "product_not_found",
        });
    });
});
