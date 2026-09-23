import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { MediaAsset } from "../application/catalog-media-provider.js";
import type {
    BannerMetadata,
    BannerMetadataPatch,
    CatalogBannerCommandV2Repository,
} from "../application/catalog-banner-command-v2.service.js";
import type { BannerAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

const readOldPublicId = (image: unknown): string | null => {
    if (!image || typeof image !== "object" || Array.isArray(image)) return null;
    const publicId = (image as Record<string, unknown>).publicId;
    return typeof publicId === "string" && publicId.length > 0 ? publicId : null;
};

const queueMediaCleanup = async (
    persistence: V2Persistence,
    transaction: Transaction,
    publicId: string,
    reason: "image_replaced" | "banner_deleted",
): Promise<void> => {
    await persistence.sequelize.query(
        `INSERT INTO outbox_events
         (event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at,
          published_at, attempts, locked_at, last_error, created_at, updated_at)
         VALUES (?, 'catalog.banner.media_cleanup_requested', 'banner_media', ?, ?,
                 UTC_TIMESTAMP(3), NULL, 0, NULL, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [randomUUID(), publicId, JSON.stringify({ publicId, reason })], transaction },
    );
};

const completeUpload = async (persistence: V2Persistence, transaction: Transaction, publicId: string): Promise<void> => {
    const resolved = await persistence.sequelize.query(
        `UPDATE outbox_events SET published_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
         WHERE event_type = 'catalog.banner.media_upload_reserved'
           AND aggregate_id = ? AND published_at IS NULL AND locked_at IS NULL AND attempts = 0`,
        { replacements: [publicId], type: QueryTypes.BULKUPDATE, transaction },
    );
    if (resolved !== 1) throw new Error("Banner upload reservation was not found.");
};

/** MySQL adapter; row lock makes image guard and deletion atomic. */
export class SequelizeCatalogBannerCommandV2Repository implements CatalogBannerCommandV2Repository {
    private readonly banner: CatalogModel<BannerAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.banner = getCatalogModel<BannerAttributes>(persistence, "Banner");
    }

    async reserveUpload(publicId: string): Promise<void> {
        await this.persistence.sequelize.query(
            `INSERT INTO outbox_events
             (event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at,
              published_at, attempts, locked_at, last_error, created_at, updated_at)
             VALUES (?, 'catalog.banner.media_upload_reserved', 'banner_media', ?, ?,
                     UTC_TIMESTAMP(3), NULL, 0, NULL, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [randomUUID(), publicId, JSON.stringify({ publicId })] },
        );
    }

    async create(metadata: BannerMetadata, asset?: MediaAsset): Promise<{ kind: "created"; bannerId: EntityId }> {
        return this.persistence.inTransaction(async (transaction) => {
            const now = new Date();
            const banner = await this.banner.create({
                ...metadata, image: asset ? { url: asset.url, publicId: asset.publicId } : null,
                createdAt: now, updatedAt: now,
            }, { transaction });
            if (asset) await completeUpload(this.persistence, transaction, asset.publicId);
            return { kind: "created", bannerId: serializeDatabaseEntityId(banner.dataValues.id) };
        });
    }

    async update(id: EntityId, patch: BannerMetadataPatch, asset?: MediaAsset): Promise<
        { kind: "updated"; oldPublicId?: string | null } | { kind: "banner_not_found" }
    > {
        return this.persistence.inTransaction(async (transaction) => {
            const banner = await this.banner.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!banner) return { kind: "banner_not_found" };
            const oldPublicId = readOldPublicId(banner.dataValues.image);
            await banner.update({ ...patch, updatedAt: new Date(),
                ...(asset ? { image: { url: asset.url, publicId: asset.publicId } } : {}),
            }, { transaction });
            if (asset) {
                await completeUpload(this.persistence, transaction, asset.publicId);
                if (oldPublicId && oldPublicId !== asset.publicId) {
                    await queueMediaCleanup(this.persistence, transaction, oldPublicId, "image_replaced");
                }
                return { kind: "updated", oldPublicId };
            }
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

    async setImage(id: EntityId, asset: MediaAsset): Promise<
        { kind: "image_set"; oldPublicId: string | null } | { kind: "banner_not_found" }
    > {
        const result = await this.update(id, {}, asset);
        return result.kind === "banner_not_found" ? result : { kind: "image_set", oldPublicId: result.oldPublicId ?? null };
    }

    async clearImageAndDelete(id: EntityId): Promise<
        { kind: "deleted"; oldPublicId: string | null } | { kind: "banner_not_found" }
    > {
        return this.persistence.inTransaction(async (transaction) => {
            const banner = await this.banner.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!banner) return { kind: "banner_not_found" };
            const oldPublicId = readOldPublicId(banner.dataValues.image);
            if (oldPublicId) {
                await queueMediaCleanup(this.persistence, transaction, oldPublicId, "banner_deleted");
            }
            await banner.destroy({ transaction });
            return { kind: "deleted", oldPublicId };
        });
    }
}
