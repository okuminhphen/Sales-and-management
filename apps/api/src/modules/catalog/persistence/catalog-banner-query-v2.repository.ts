import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import {
    toCatalogPublicImage,
    toCatalogPublicTargetUrl,
} from "../application/catalog-public-media.js";
import type {
    CatalogBanner,
    CatalogBannerListQuery,
    CatalogBannerPage,
    CatalogBannerV2Repository,
} from "../application/catalog-banner-query-v2.service.js";
import type {
    CatalogAdminBanner,
    CatalogAdminBannerPage,
    CatalogBannerAdminV2Repository,
} from "../application/catalog-banner-admin-query-v2.service.js";
import type { BannerAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

const toCatalogBanner = (banner: BannerAttributes): CatalogBanner => ({
    id: serializeDatabaseEntityId(banner.id),
    name: banner.name,
    image: toCatalogPublicImage(banner.image),
    targetUrl: toCatalogPublicTargetUrl(banner.targetUrl),
});

const toCatalogAdminBanner = (banner: BannerAttributes): CatalogAdminBanner => ({
    ...toCatalogBanner(banner),
    status: banner.status,
});

/** MySQL adapter for public active banner reads, ordered by newest first. */
export class SequelizeCatalogBannerV2Repository implements CatalogBannerV2Repository, CatalogBannerAdminV2Repository {
    private readonly banner: CatalogModel<BannerAttributes>;

    constructor(persistence: V2Persistence) {
        this.banner = getCatalogModel<BannerAttributes>(persistence, "Banner");
    }

    async listActive(query: CatalogBannerListQuery): Promise<CatalogBannerPage> {
        const { count, rows } = await this.banner.findAndCountAll({
            where: { status: "active" },
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["createdAt", "DESC"], ["id", "DESC"]],
        });
        return {
            banners: rows.map((banner) => toCatalogBanner(banner.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }

    async listAll(query: CatalogBannerListQuery): Promise<CatalogAdminBannerPage> {
        const { count, rows } = await this.banner.findAndCountAll({
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["createdAt", "DESC"], ["id", "DESC"]],
        });
        return {
            banners: rows.map((banner) => toCatalogAdminBanner(banner.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }
}
