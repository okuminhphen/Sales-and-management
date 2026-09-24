import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import type { EntityId } from "../../../shared/contracts/database-scalars.js";
import { isOwnedProductAsset, type MediaAsset } from "../application/catalog-media-provider.js";
import type { CatalogProductMediaV2Repository } from "../application/catalog-product-media-v2.service.js";
import type { ProductAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";
import { appendCatalogProductEvent } from "./catalog-product-command-v2.repository.js";

const oldAssetIds = (images: unknown): readonly string[] => {
    if (!Array.isArray(images)) return [];
    return images.flatMap((image: unknown) => {
        if (!image || typeof image !== "object" || Array.isArray(image)) return [];
        const publicId = (image as Record<string, unknown>).publicId;
        return typeof publicId === "string" && isOwnedProductAsset(publicId) ? [publicId] : [];
    });
};

const reserveEventType = "catalog.product.media_upload_reserved";
const cleanupEventType = "catalog.product.media_cleanup_requested";

const completeUpload = async (persistence: V2Persistence, transaction: Transaction, publicId: string): Promise<void> => {
    const count = await persistence.sequelize.query(
        `UPDATE outbox_events SET published_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
         WHERE event_type = ? AND aggregate_id = ? AND published_at IS NULL
           AND locked_at IS NULL AND attempts = 0`,
        { replacements: [reserveEventType, publicId], type: QueryTypes.BULKUPDATE, transaction },
    );
    if (count !== 1) throw new Error("Product media upload reservation was not found.");
};

const queueCleanup = async (persistence: V2Persistence, transaction: Transaction, publicId: string): Promise<void> => {
    await persistence.sequelize.query(
        `INSERT INTO outbox_events
         (event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at,
          published_at, attempts, locked_at, last_error, created_at, updated_at)
         VALUES (?, ?, 'product_media', ?, ?, UTC_TIMESTAMP(3), NULL, 0, NULL, NULL,
                 UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [randomUUID(), cleanupEventType, publicId,
            JSON.stringify({ publicId, reason: "image_replaced" })], transaction },
    );
};

/** Replaces image JSON and commits product/cleanup outbox intents atomically. */
export class SequelizeCatalogProductMediaV2Repository implements CatalogProductMediaV2Repository {
    private readonly product: CatalogModel<ProductAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.product = getCatalogModel<ProductAttributes>(persistence, "Product");
    }

    async exists(id: EntityId): Promise<boolean> {
        return await this.product.findByPk(id, { attributes: ["id"] }) !== null;
    }

    async reserveUpload(publicId: string): Promise<void> {
        if (!isOwnedProductAsset(publicId)) throw new TypeError("Invalid product asset ID.");
        await this.persistence.sequelize.query(
            `INSERT INTO outbox_events
             (event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at,
              published_at, attempts, locked_at, last_error, created_at, updated_at)
             VALUES (?, ?, 'product_media', ?, ?, UTC_TIMESTAMP(3), NULL, 0, NULL, NULL,
                     UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [randomUUID(), reserveEventType, publicId, JSON.stringify({ publicId })] },
        );
    }

    async replaceImages(id: EntityId, assets: readonly MediaAsset[]): Promise<"updated" | "product_not_found"> {
        return this.persistence.inTransaction(async (transaction) => {
            const product = await this.product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!product) return "product_not_found";
            const oldIds = oldAssetIds(product.dataValues.images);
            await product.update({ images: assets.map((asset) => ({ url: asset.url, publicId: asset.publicId })),
                updatedAt: new Date() }, { transaction });
            for (const asset of assets) await completeUpload(this.persistence, transaction, asset.publicId);
            for (const publicId of oldIds) await queueCleanup(this.persistence, transaction, publicId);
            await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
            return "updated";
        });
    }

    async clearImages(id: EntityId): Promise<"updated" | "product_not_found"> {
        return this.persistence.inTransaction(async (transaction) => {
            const product = await this.product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!product) return "product_not_found";
            const oldIds = oldAssetIds(product.dataValues.images);
            if (oldIds.length === 0 && (!Array.isArray(product.dataValues.images) || product.dataValues.images.length === 0)) {
                return "updated";
            }
            await product.update({ images: [], updatedAt: new Date() }, { transaction });
            for (const publicId of oldIds) await queueCleanup(this.persistence, transaction, publicId);
            await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
            return "updated";
        });
    }
}
