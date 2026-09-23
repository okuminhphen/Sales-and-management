import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    ReviewListQuery,
    ReviewPage,
    ReviewQueryV2Repository,
    ReviewView,
} from "../application/review-query-v2.service.js";

type ReviewRow = {
    id: unknown;
    rating: unknown;
    comment: unknown;
    authorUsername: unknown;
    createdAt: unknown;
};

const isNullableString = (value: unknown): value is string | null =>
    value === null || typeof value === "string";

const toReviewView = (row: ReviewRow): ReviewView => {
    const comment = row.comment;
    const authorUsername = row.authorUsername;
    if (typeof row.rating !== "number" || !Number.isInteger(row.rating)
        || row.rating < 1 || row.rating > 5) throw new TypeError("Database review rating is invalid.");
    if (!isNullableString(comment)) {
        throw new TypeError("Database review comment is invalid.");
    }
    if (!isNullableString(authorUsername)) {
        throw new TypeError("Database review username is invalid.");
    }
    if (!(row.createdAt instanceof Date) || Number.isNaN(row.createdAt.getTime())) {
        throw new TypeError("Database review timestamp is invalid.");
    }
    return {
        id: serializeDatabaseEntityId(row.id),
        rating: row.rating,
        comment,
        authorUsername,
        createdAt: row.createdAt.toISOString(),
    };
};

/** Public projection deliberately excludes customer/account identifiers and email. */
export class SequelizeReviewQueryV2Repository implements ReviewQueryV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listByProductId(productId: EntityId, query: ReviewListQuery): Promise<ReviewPage> {
        const counts = await this.persistence.sequelize.query<{ totalItems: number | string }>(
            "SELECT COUNT(*) AS totalItems FROM reviews WHERE product_id = ?",
            { replacements: [productId], type: QueryTypes.SELECT },
        );
        const totalItems = Number(counts[0]?.totalItems ?? 0);
        if (!Number.isSafeInteger(totalItems) || totalItems < 0) {
            throw new TypeError("Database review count is invalid.");
        }
        const rows = await this.persistence.sequelize.query<ReviewRow>(
            `SELECT reviews.id AS id, reviews.rating AS rating,
                    reviews.review_text AS comment, accounts.username AS authorUsername,
                    reviews.created_at AS createdAt
             FROM reviews
             INNER JOIN customers ON customers.id = reviews.customer_id
             LEFT JOIN accounts ON accounts.id = customers.account_id
             WHERE reviews.product_id = ?
             ORDER BY reviews.created_at DESC, reviews.id DESC
             LIMIT ? OFFSET ?`,
            {
                replacements: [productId, query.limit, (query.page - 1) * query.limit],
                type: QueryTypes.SELECT,
            },
        );
        return {
            items: rows.map(toReviewView),
            page: query.page,
            limit: query.limit,
            totalItems,
            totalPages: Math.ceil(totalItems / query.limit),
        };
    }
}
