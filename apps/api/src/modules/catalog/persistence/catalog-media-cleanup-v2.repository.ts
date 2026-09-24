import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { CatalogMediaCleanupJob, CatalogMediaCleanupV2Repository } from
    "../application/catalog-media-cleanup-v2.worker.js";

type CleanupRow = { id: unknown; aggregateId: string; eventType: string; attempts: number };

/** Uses the existing V2 outbox table; a stale lease is reclaimed after one minute. */
export class SequelizeCatalogMediaCleanupV2Repository implements CatalogMediaCleanupV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async claimNext(): Promise<CatalogMediaCleanupJob | null> {
        return this.persistence.inTransaction(async (transaction) => {
            const rows = await this.persistence.sequelize.query<CleanupRow>(
                `SELECT id, aggregate_id AS aggregateId, event_type AS eventType, attempts
                 FROM outbox_events
                 WHERE published_at IS NULL AND attempts < 20
                   AND (locked_at IS NULL OR locked_at < UTC_TIMESTAMP(3) - INTERVAL 60 SECOND)
                   AND (event_type IN ('catalog.banner.media_cleanup_requested', 'catalog.product.media_cleanup_requested')
                        OR (event_type IN ('catalog.banner.media_upload_reserved', 'catalog.product.media_upload_reserved')
                            AND created_at < UTC_TIMESTAMP(3) - INTERVAL 5 MINUTE))
                 ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
                { type: QueryTypes.SELECT, transaction },
            );
            const row = rows[0];
            if (!row) return null;
            await this.persistence.sequelize.query(
                `UPDATE outbox_events
                 SET attempts = attempts + 1, locked_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
                 WHERE id = ?`,
                { replacements: [row.id], transaction },
            );
            return {
                id: serializeDatabaseEntityId(row.id),
                publicId: row.aggregateId,
                kind: row.eventType.endsWith("media_upload_reserved")
                    ? "upload_reserved" : "cleanup_requested",
                attempts: row.attempts + 1,
            };
        });
    }

    async isReferenced(publicId: string): Promise<boolean> {
        const rows = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT id FROM banners
             WHERE JSON_UNQUOTE(JSON_EXTRACT(image, '$.publicId')) = ?
             UNION ALL
             SELECT products.id FROM products
             JOIN JSON_TABLE(products.images, '$[*]'
                 COLUMNS (public_id VARCHAR(128) PATH '$.publicId')) AS product_image
               ON product_image.public_id = ?
             LIMIT 1`,
            { replacements: [publicId, publicId], type: QueryTypes.SELECT },
        );
        return rows.length > 0;
    }

    async markCompleted(id: EntityId): Promise<void> {
        await this.persistence.sequelize.query(
            `UPDATE outbox_events SET published_at = UTC_TIMESTAMP(3), locked_at = NULL,
                 last_error = NULL, updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND published_at IS NULL`,
            { replacements: [id] },
        );
    }

    async markFailed(id: EntityId, error: string): Promise<void> {
        await this.persistence.sequelize.query(
            `UPDATE outbox_events SET last_error = ?, updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND published_at IS NULL`,
            { replacements: [error.slice(0, 100), id] },
        );
    }
}
