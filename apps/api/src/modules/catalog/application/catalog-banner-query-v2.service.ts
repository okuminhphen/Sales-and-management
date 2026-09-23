import type { EntityId } from "../../../shared/contracts/database-scalars.js";
import type { CatalogPublicImage } from "./catalog-public-media.js";

export type CatalogBanner = {
    id: EntityId;
    name: string;
    image: CatalogPublicImage | null;
    targetUrl: string | null;
};

export type CatalogBannerListInput = {
    page?: unknown;
    limit?: unknown;
};

export type CatalogBannerListQuery = {
    page: number;
    limit: number;
};

export type CatalogBannerPage = {
    banners: readonly CatalogBanner[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

/** Query port intentionally omits banner administration and media lifecycle mutation. */
export interface CatalogBannerV2Repository {
    listActive: (query: CatalogBannerListQuery) => Promise<CatalogBannerPage>;
}

export type CatalogBannerQueryResult =
    | { kind: "banners"; page: CatalogBannerPage }
    | { kind: "invalid_banner_query" }
    | { kind: "catalog_unavailable" };

const defaultPage = 1;
const defaultLimit = 20;
const maximumLimit = 100;

const normalizeListQuery = (
    input: CatalogBannerListInput | undefined,
): CatalogBannerListQuery | null => {
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

/** Public active banner directory; administrative lifecycle stays in its own authorized use case. */
export class CatalogBannerQueryV2Service {
    constructor(private readonly dependencies: { repository: CatalogBannerV2Repository }) {}

    async list(input?: CatalogBannerListInput): Promise<CatalogBannerQueryResult> {
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_banner_query" };
        try {
            return { kind: "banners", page: await this.dependencies.repository.listActive(query) };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }
}
