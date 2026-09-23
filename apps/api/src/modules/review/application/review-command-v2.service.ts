import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type CreateReviewInput = { productId: unknown; rating: unknown; comment: unknown };
export type CreateReviewOutcome =
    | { kind: "created"; reviewId: EntityId }
    | { kind: "product_not_found" }
    | { kind: "already_reviewed" };
export type CreateReviewResult = CreateReviewOutcome
    | { kind: "customer_profile_required" }
    | { kind: "invalid_review" }
    | { kind: "review_unavailable" };

export interface ReviewCommandV2Repository {
    create: (
        customerId: EntityId, productId: EntityId, rating: number, comment: string,
    ) => Promise<CreateReviewOutcome>;
}

/** Customer identity comes only from the DB-derived V2 access context. */
export class ReviewCommandV2Service {
    constructor(private readonly dependencies: { repository: ReviewCommandV2Repository }) {}

    async create(context: V2AccessContext, input: CreateReviewInput): Promise<CreateReviewResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        if (typeof input.rating !== "number" || !Number.isInteger(input.rating)
            || input.rating < 1 || input.rating > 5 || typeof input.comment !== "string") {
            return { kind: "invalid_review" };
        }
        const comment = input.comment.trim();
        if (comment.length < 1 || comment.length > 2000) return { kind: "invalid_review" };
        let productId: EntityId;
        try {
            productId = serializeEntityId(input.productId);
        } catch {
            return { kind: "invalid_review" };
        }
        try {
            return await this.dependencies.repository.create(
                serializeEntityId(context.customerId), productId, input.rating, comment,
            );
        } catch {
            return { kind: "review_unavailable" };
        }
    }
}
