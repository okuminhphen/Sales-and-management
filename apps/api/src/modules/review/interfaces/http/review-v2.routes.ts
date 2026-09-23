import { Router, type RequestHandler } from "express";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import type { ReviewCommandV2Service } from "../../application/review-command-v2.service.js";
import type { ReviewQueryV2Service } from "../../application/review-query-v2.service.js";
import { createReviewV2Controller } from "./review-v2.controller.js";
import { reviewCreateBodyV2, reviewListQueryV2, reviewProductParamsV2 } from "./review-v2.dto.js";

/** V2-compatible routes; mounted only by the later V2 composition checkpoint. */
export const createReviewV2Router = (dependencies: {
    auth: RequestHandler;
    command: ReviewCommandV2Service;
    query: ReviewQueryV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    const controller = createReviewV2Controller(dependencies);
    router.post("/review/add", createV2HttpAudit("review.create", dependencies.audit), dependencies.auth, validateRequest({ body: reviewCreateBodyV2 }), controller.create);
    router.get("/review/product/:productId", validateRequest({
        params: reviewProductParamsV2,
        query: reviewListQueryV2,
    }), controller.list);
    return router;
};
