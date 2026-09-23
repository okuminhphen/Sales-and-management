import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import type { CatalogBanner } from "./catalog-banner-query-v2.service.js";
import {
    normalizeListQuery,
    type CatalogBannerListInput,
    type CatalogBannerListQuery,
} from "./catalog-banner-query-v2.service.js";
import { canManageBanners } from "./catalog-banner-policy.js";
import type { BannerStatus } from "./catalog-banner-command-v2.service.js";

export type CatalogAdminBanner = CatalogBanner & { status: BannerStatus };
export type CatalogAdminBannerPage = {
    banners: readonly CatalogAdminBanner[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

export interface CatalogBannerAdminV2Repository {
    listAll: (query: CatalogBannerListQuery) => Promise<CatalogAdminBannerPage>;
}

export type CatalogBannerAdminQueryResult =
    | { kind: "banners"; page: CatalogAdminBannerPage }
    | { kind: "forbidden" }
    | { kind: "invalid_banner_query" }
    | { kind: "catalog_unavailable" };

/** Backoffice directory includes draft/inactive banners; public directory stays active-only. */
export class CatalogBannerAdminQueryV2Service {
    constructor(private readonly dependencies: { repository: CatalogBannerAdminV2Repository }) {}

    async list(
        context: V2AccessContext, input?: CatalogBannerListInput,
    ): Promise<CatalogBannerAdminQueryResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_banner_query" };
        try {
            return { kind: "banners", page: await this.dependencies.repository.listAll(query) };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }
}
