import type { EntityId } from "../../../shared/contracts/database-scalars.js";

export type CatalogCategory = {
    id: EntityId;
    parentId: EntityId | null;
    code: string;
    name: string;
    slug: string;
    description: string | null;
};

export type CatalogCategoryListInput = {
    page?: unknown;
    limit?: unknown;
};

export type CatalogCategoryListQuery = {
    page: number;
    limit: number;
};

export type CatalogCategoryPage = {
    categories: readonly CatalogCategory[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

/** Query port intentionally exposes no category mutation while hierarchy policy is still pending. */
export interface CatalogCategoryV2Repository {
    listCategories: (query: CatalogCategoryListQuery) => Promise<CatalogCategoryPage>;
}

export type CatalogCategoryQueryResult =
    | { kind: "categories"; page: CatalogCategoryPage }
    | { kind: "invalid_catalog_query" }
    | { kind: "catalog_unavailable" };

const defaultPage = 1;
const defaultLimit = 20;
const maximumLimit = 100;

const normalizeListQuery = (
    input: CatalogCategoryListInput | undefined,
): CatalogCategoryListQuery | null => {
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
 * Public catalog directory. Categories have no visibility state in Database V2,
 * matching the legacy public-read contract. Hierarchy mutation is deliberately
 * omitted until the anti-cycle business rule has an approved policy.
 */
export class CatalogCategoryQueryV2Service {
    constructor(private readonly dependencies: { repository: CatalogCategoryV2Repository }) {}

    async list(input?: CatalogCategoryListInput): Promise<CatalogCategoryQueryResult> {
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_catalog_query" };
        try {
            return { kind: "categories", page: await this.dependencies.repository.listCategories(query) };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }
}
