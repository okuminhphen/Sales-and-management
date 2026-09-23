import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    BannerMetadata,
    BannerMetadataPatch,
    CatalogBannerCommandV2Repository,
} from "../application/catalog-banner-command-v2.service.js";
import type { BannerAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

/** MySQL adapter; row lock makes image guard and deletion atomic. */
export class SequelizeCatalogBannerCommandV2Repository implements CatalogBannerCommandV2Repository {
    private readonly banner: CatalogModel<BannerAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.banner = getCatalogModel<BannerAttributes>(persistence, "Banner");
    }

    async create(metadata: BannerMetadata): Promise<{ kind: "created"; bannerId: EntityId }> {
        const now = new Date();
        const banner = await this.banner.create({
            ...metadata, image: null, createdAt: now, updatedAt: now,
        });
        return { kind: "created", bannerId: serializeDatabaseEntityId(banner.dataValues.id) };
    }

    async update(id: EntityId, patch: BannerMetadataPatch): Promise<
        { kind: "updated" } | { kind: "banner_not_found" }
    > {
        return this.persistence.inTransaction(async (transaction) => {
            const banner = await this.banner.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!banner) return { kind: "banner_not_found" };
            await banner.update({ ...patch, updatedAt: new Date() }, { transaction });
            return { kind: "updated" };
        });
    }

    async deleteWithoutMedia(id: EntityId): Promise<
        { kind: "deleted" } | { kind: "banner_not_found" } | { kind: "media_cleanup_required" }
    > {
        return this.persistence.inTransaction(async (transaction) => {
            const banner = await this.banner.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!banner) return { kind: "banner_not_found" };
            if (banner.dataValues.image !== null) return { kind: "media_cleanup_required" };
            await banner.destroy({ transaction });
            return { kind: "deleted" };
        });
    }
}
