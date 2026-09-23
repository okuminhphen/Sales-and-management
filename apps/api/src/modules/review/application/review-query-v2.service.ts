import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReviewView = {
    id: EntityId;
    rating: number;
    comment: string | null;
    authorUsername: string | null;
    createdAt: string;
};
export type ReviewListInput = { page?: unknown; limit?: unknown };
export type ReviewListQuery = { page: number; limit: number };
export type ReviewPage = {
    items: readonly ReviewView[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};
export interface ReviewQueryV2Repository {
    listByProductId: (productId: EntityId, query: ReviewListQuery) => Promise<ReviewPage>;
}
export type ReviewQueryResult =
    | { kind: "reviews"; page: ReviewPage }
    | { kind: "invalid_review_query" }
    | { kind: "reviews_unavailable" };

/** Public product reviews; customer/account IDs are never part of the view. */
export class ReviewQueryV2Service {
    constructor(private readonly dependencies: { repository: ReviewQueryV2Repository }) {}

    async listByProductId(productIdInput: unknown, input?: ReviewListInput): Promise<ReviewQueryResult> {
        let productId: EntityId;
        try {
            productId = serializeEntityId(productIdInput);
        } catch {
            return { kind: "invalid_review_query" };
        }
        const page = input?.page === undefined ? 1 : input.page;
        const limit = input?.limit === undefined ? 20 : input.limit;
        if (typeof page !== "number" || typeof limit !== "number"
            || !Number.isSafeInteger(page) || !Number.isSafeInteger(limit)
            || page <= 0 || limit <= 0 || limit > 100
            || !Number.isSafeInteger((page - 1) * limit)) {
            return { kind: "invalid_review_query" };
        }
        try {
            return {
                kind: "reviews",
                page: await this.dependencies.repository.listByProductId(productId, { page, limit }),
            };
        } catch {
            return { kind: "reviews_unavailable" };
        }
    }
}
