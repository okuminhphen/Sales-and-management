import {
    serializeEntityId,
    type EntityId,
    type Money,
} from "../../../shared/contracts/database-scalars.js";
import type { CatalogPublicImage } from "./catalog-public-media.js";

export type CatalogProductImage = CatalogPublicImage;

export type CatalogProduct = {
    id: EntityId;
    categoryId: EntityId;
    name: string;
    slug: string;
    description: string | null;
    basePrice: Money;
    images: readonly CatalogProductImage[];
};

export type CatalogProductListInput = {
    page?: unknown;
    limit?: unknown;
};

export type CatalogProductListQuery = {
    page: number;
    limit: number;
};

export type CatalogProductPage = {
    products: readonly CatalogProduct[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

/** Public query port reads only sellable products; stock remains in the inventory aggregate. */
export interface CatalogProductV2Repository {
    findActiveById: (productId: EntityId) => Promise<CatalogProduct | null>;
    listActive: (query: CatalogProductListQuery) => Promise<CatalogProductPage>;
}

export type CatalogProductQueryResult =
    | { kind: "products"; page: CatalogProductPage }
    | { kind: "product"; product: CatalogProduct }
    | { kind: "product_not_found" }
    | { kind: "invalid_product_query" }
    | { kind: "catalog_unavailable" };

const defaultPage = 1;
const defaultLimit = 20;
const maximumLimit = 100;

const parseProductId = (value: unknown): EntityId | null => {
    try {
        return serializeEntityId(value);
    } catch {
        return null;
    }
};

const normalizeListQuery = (
    input: CatalogProductListInput | undefined,
): CatalogProductListQuery | null => {
    const page = input?.page === undefined ? defaultPage : input.page;
    const limit = input?.limit === undefined ? defaultLimit : input.limit;
    if (
        typeof page !== "number" || typeof limit !== "number"
        || !Number.isInteger(page) || !Number.isInteger(limit)
        || page <= 0 || limit <= 0 || limit > maximumLimit
    ) return null;
    return { page, limit };
};

/**
 * Public product read model. Draft and inactive products are not observable at
 * this boundary; backoffice catalog administration is a separate authorized use case.
 */
export class CatalogProductQueryV2Service {
    constructor(private readonly dependencies: { repository: CatalogProductV2Repository }) {}

    async list(input?: CatalogProductListInput): Promise<CatalogProductQueryResult> {
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_product_query" };
        try {
            return { kind: "products", page: await this.dependencies.repository.listActive(query) };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }

    async getById(productIdInput: unknown): Promise<CatalogProductQueryResult> {
        const productId = parseProductId(productIdInput);
        if (!productId) return { kind: "invalid_product_query" };
        try {
            const product = await this.dependencies.repository.findActiveById(productId);
            return product ? { kind: "product", product } : { kind: "product_not_found" };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }
}
