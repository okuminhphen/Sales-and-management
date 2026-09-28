import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import type { EntityId } from "../../../shared/contracts/database-scalars.js";
import type { BehaviorV2Repository } from "../application/behavior-v2.service.js";

type LikeRow = { isLiked: number | boolean };

export class SequelizeBehaviorV2Repository implements BehaviorV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    private async eligible(customerId: EntityId, productId: EntityId, transaction?: Transaction): Promise<boolean> {
        const rows = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT p.id FROM products p
             INNER JOIN customers c ON c.id = ? AND c.status = 'active'
             WHERE p.id = ? AND p.status = 'active'${transaction ? " FOR UPDATE" : ""}`,
            { replacements: [customerId, productId], transaction, type: QueryTypes.SELECT },
        );
        return rows.length === 1;
    }

    async recordView(customerId: EntityId, productId: EntityId): Promise<boolean> {
        return this.persistence.inTransaction(async (transaction) => {
            if (!await this.eligible(customerId, productId, transaction)) return false;
            await this.persistence.sequelize.query(
                `INSERT INTO customer_product_stats
                    (customer_id, product_id, view_count, is_liked, last_viewed_at, updated_at)
                 VALUES (?, ?, 1, FALSE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                 ON DUPLICATE KEY UPDATE view_count = view_count + 1,
                    last_viewed_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)`,
                { replacements: [customerId, productId], transaction, type: QueryTypes.INSERT },
            );
            await this.persistence.sequelize.query(
                `INSERT INTO behavior_events
                    (customer_id, anonymous_session_id, product_id, event_type, event_data, occurred_at, created_at)
                 VALUES (?, NULL, ?, 'product_view', NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                { replacements: [customerId, productId], transaction, type: QueryTypes.INSERT },
            );
            return true;
        });
    }

    async toggleLike(customerId: EntityId, productId: EntityId): Promise<boolean | null> {
        return this.persistence.inTransaction(async (transaction) => {
            if (!await this.eligible(customerId, productId, transaction)) return null;
            const rows = await this.persistence.sequelize.query<LikeRow>(
                `SELECT is_liked AS isLiked FROM customer_product_stats
                 WHERE customer_id = ? AND product_id = ? FOR UPDATE`,
                { replacements: [customerId, productId], transaction, type: QueryTypes.SELECT },
            );
            const isLiked = !(rows[0]?.isLiked === true || rows[0]?.isLiked === 1);
            await this.persistence.sequelize.query(
                `INSERT INTO customer_product_stats
                    (customer_id, product_id, view_count, is_liked, last_viewed_at, updated_at)
                 VALUES (?, ?, 0, ?, NULL, UTC_TIMESTAMP(3))
                 ON DUPLICATE KEY UPDATE is_liked = VALUES(is_liked), updated_at = UTC_TIMESTAMP(3)`,
                { replacements: [customerId, productId, isLiked], transaction, type: QueryTypes.INSERT },
            );
            await this.persistence.sequelize.query(
                `INSERT INTO behavior_events
                    (customer_id, anonymous_session_id, product_id, event_type, event_data, occurred_at, created_at)
                 VALUES (?, NULL, ?, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                { replacements: [customerId, productId, isLiked ? "product_like" : "product_unlike"], transaction, type: QueryTypes.INSERT },
            );
            return isLiked;
        });
    }

    async getLikeStatus(customerId: EntityId, productId: EntityId): Promise<boolean | null> {
        if (!await this.eligible(customerId, productId)) return null;
        const rows = await this.persistence.sequelize.query<LikeRow>(
            `SELECT is_liked AS isLiked FROM customer_product_stats
             WHERE customer_id = ? AND product_id = ?`,
            { replacements: [customerId, productId], type: QueryTypes.SELECT },
        );
        return rows[0]?.isLiked === true || rows[0]?.isLiked === 1;
    }
}
