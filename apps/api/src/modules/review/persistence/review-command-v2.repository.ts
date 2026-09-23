import { QueryTypes, UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import type {
    CreateReviewOutcome,
    ReviewCommandV2Repository,
} from "../application/review-command-v2.service.js";

type IdRow = { id: unknown };

/** MySQL adapter: unique(customer_id, product_id) arbitrates concurrent submissions. */
export class SequelizeReviewCommandV2Repository implements ReviewCommandV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async create(
        customerId: EntityId, productId: EntityId, rating: number, comment: string,
    ): Promise<CreateReviewOutcome> {
        const products = await this.persistence.sequelize.query<IdRow>(
            "SELECT id FROM products WHERE id = ?",
            { replacements: [productId], type: QueryTypes.SELECT },
        );
        if (!products[0]) return { kind: "product_not_found" };

        try {
            await this.persistence.sequelize.query(
                `INSERT INTO reviews
                 (customer_id, product_id, order_item_id, rating, review_text, created_at, updated_at)
                 VALUES (?, ?, NULL, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                { replacements: [customerId, productId, rating, comment] },
            );
        } catch (error) {
            if (error instanceof UniqueConstraintError) return { kind: "already_reviewed" };
            throw error;
        }

        const rows = await this.persistence.sequelize.query<IdRow>(
            "SELECT id FROM reviews WHERE customer_id = ? AND product_id = ?",
            { replacements: [customerId, productId], type: QueryTypes.SELECT },
        );
        if (!rows[0]) throw new Error("Created review could not be read.");
        return { kind: "created", reviewId: serializeDatabaseEntityId(rows[0].id) };
    }
}
