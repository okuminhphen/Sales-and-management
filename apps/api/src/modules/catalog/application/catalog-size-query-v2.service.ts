import type { EntityId } from "../../../shared/contracts/database-scalars.js";

export type CatalogSize = {
    id: EntityId;
    name: string;
};

export type CatalogSizeListInput = {
    page?: unknown;
    limit?: unknown;
};

export type CatalogSizeListQuery = {
    page: number;
    limit: number;
};

export type CatalogSizePage = {
    sizes: readonly CatalogSize[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

/** Query port deliberately has no size mutation while product-variant write rules are pending. */
export interface CatalogSizeV2Repository {
    listSizes: (query: CatalogSizeListQuery) => Promise<CatalogSizePage>;
}

export type CatalogSizeQueryResult =
    | { kind: "sizes"; page: CatalogSizePage }
    | { kind: "invalid_catalog_query" }
    | { kind: "catalog_unavailable" };

const defaultPage = 1;
const defaultLimit = 20;
const maximumLimit = 100;

const normalizeListQuery = (
    input: CatalogSizeListInput | undefined,
): CatalogSizeListQuery | null => {
    const page = input?.page === undefined ? defaultPage : input.page;
    const limit = input?.limit === undefined ? defaultLimit : input.limit;
    if (
        typeof page !== "number" || typeof limit !== "number"
        || !Number.isSafeInteger(page) || !Number.isSafeInteger(limit)
        || page <= 0 || limit <= 0 || limit > maximumLimit
        || !Number.isSafeInteger((page - 1) * limit)
    ) return null;
    return { page, limit };
};

/**
 * Public size directory. Size has no visibility state in Database V2 and is a
 * shared catalog reference; product/variant availability remains a separate query.
 */
export class CatalogSizeQueryV2Service {
    constructor(private readonly dependencies: { repository: CatalogSizeV2Repository }) {}

    async list(input?: CatalogSizeListInput): Promise<CatalogSizeQueryResult> {
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_catalog_query" };
        try {
            return { kind: "sizes", page: await this.dependencies.repository.listSizes(query) };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }
}
