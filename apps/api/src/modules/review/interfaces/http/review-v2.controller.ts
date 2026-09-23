import type { RequestHandler } from "express";
import type { ReviewCommandV2Service } from "../../application/review-command-v2.service.js";
import type { ReviewQueryV2Service } from "../../application/review-query-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

export const createReviewV2Controller = (dependencies: {
    command: ReviewCommandV2Service;
    query: ReviewQueryV2Service;
}): { create: RequestHandler; list: RequestHandler } => ({
    create: async (request, response) => {
        const context = (request as V2AuthenticatedRequest).v2AccessContext;
        if (!context) {
            response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            return;
        }
        const result = await dependencies.command.create(context, request.body);
        switch (result.kind) {
            case "created":
                response.locals.auditResourceId = result.reviewId;
                response.status(201).json({ EM: "Add review successfully", EC: 0, DT: { id: result.reviewId } });
                return;
            case "product_not_found":
                response.status(404).json({ EM: "Product not found", EC: 1, DT: null });
                return;
            case "already_reviewed":
                response.status(409).json({ EM: "Product already reviewed", EC: 1, DT: null });
                return;
            case "customer_profile_required":
                response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
                return;
            case "invalid_review":
                response.status(400).json({ EM: "Invalid review", EC: 1, DT: null });
                return;
            case "review_unavailable":
                response.status(503).json({ EM: "Review service unavailable", EC: -1, DT: null });
                return;
        }
    },
    list: async (request, response) => {
        const result = await dependencies.query.listByProductId(
            request.params.productId,
            request.query,
        );
        switch (result.kind) {
            case "reviews":
                response.status(200).json({
                    EM: "Get reviews by product id successfully",
                    EC: 0,
                    DT: result.page.items.map((review) => ({
                        id: review.id,
                        rating: review.rating,
                        reviewText: review.comment,
                        user: review.authorUsername === null ? null : { username: review.authorUsername },
                        createdAt: review.createdAt,
                    })),
                    pagination: {
                        page: result.page.page,
                        limit: result.page.limit,
                        totalItems: result.page.totalItems,
                        totalPages: result.page.totalPages,
                    },
                });
                return;
            case "invalid_review_query":
                response.status(400).json({ EM: "Invalid review query", EC: 1, DT: [] });
                return;
            case "reviews_unavailable":
                response.status(503).json({ EM: "Review service unavailable", EC: -1, DT: [] });
                return;
        }
    },
});
