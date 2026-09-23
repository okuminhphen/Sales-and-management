import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId,
    serializeMoney,
} from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogProduct,
    CatalogProductImage,
    CatalogProductListQuery,
    CatalogProductPage,
    CatalogProductV2Repository,
} from "../application/catalog-product-query-v2.service.js";
import type { ProductAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

const isSafePublicImageUrl = (value: unknown): value is string => {
    if (typeof value !== "string" || value.length === 0 || value.length > 2_000) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
};

const toPublicImages = (images: ProductAttributes["images"]): readonly CatalogProductImage[] => {
    if (!Array.isArray(images)) return [];
    return images.flatMap((image) => {
        if (!image || typeof image !== "object" || Array.isArray(image)) return [];
        if (!Object.prototype.hasOwnProperty.call(image, "url")) return [];
        const url = (image as Record<string, unknown>).url;
        return isSafePublicImageUrl(url) ? [{ url }] : [];
    });
};

const toCatalogProduct = (product: ProductAttributes): CatalogProduct => ({
    id: serializeDatabaseEntityId(product.id),
    categoryId: serializeDatabaseEntityId(product.categoryId),
    name: product.name,
    slug: product.slug,
    description: product.description,
    basePrice: serializeMoney(product.basePrice),
    images: toPublicImages(product.images),
});

/** MySQL adapter for public active product reads; inventory is intentionally not joined here. */
export class SequelizeCatalogProductV2Repository implements CatalogProductV2Repository {
    private readonly product: CatalogModel<ProductAttributes>;

    constructor(persistence: V2Persistence) {
        this.product = getCatalogModel<ProductAttributes>(persistence, "Product");
    }

    async findActiveById(productId: string): Promise<CatalogProduct | null> {
        const product = await this.product.findOne({ where: { id: productId, status: "active" } });
        return product ? toCatalogProduct(product.dataValues) : null;
    }

    async listActive(query: CatalogProductListQuery): Promise<CatalogProductPage> {
        const { count, rows } = await this.product.findAndCountAll({
            where: { status: "active" },
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["createdAt", "DESC"], ["id", "DESC"]],
        });
        return {
            products: rows.map((product) => toCatalogProduct(product.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }
}
