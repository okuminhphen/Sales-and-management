import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import { v2EntityId } from "../../../../shared/contracts/v2-entity-id.dto.js";
import type { BehaviorResult, BehaviorV2Service } from "../../application/behavior-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

const params = z.object({ productId: v2EntityId }).strict();
const reject = (response: Response, result: BehaviorResult): void => {
    const status = result.kind === "customer_required" ? 403 : result.kind === "invalid_product_id" ? 400
        : result.kind === "product_not_found" ? 404 : 503;
    response.status(status).json({ EM: result.kind, EC: status === 403 ? 3 : status >= 500 ? -1 : 1, DT: null });
};

export const createBehaviorV2Router = (dependencies: {
    auth: RequestHandler;
    audit?: V2HttpAuditWriter;
    service: BehaviorV2Service;
}): Router => {
    const router = Router();
    const contextOf = (request: Parameters<RequestHandler>[0]) => (request as V2AuthenticatedRequest).v2AccessContext;
    router.post("/behavior/view/:productId", createV2HttpAudit("behavior.product_view", dependencies.audit),
        dependencies.auth, validateRequest({ params }), async (request, response) => {
            const context = contextOf(request);
            if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
            const result = await dependencies.service.recordView(context, request.params.productId);
            if (result.kind !== "view_recorded") { reject(response, result); return; }
            response.status(200).json({ EM: "View recorded", EC: 0, DT: null });
        });
    router.post("/behavior/like/:productId", createV2HttpAudit("behavior.product_like_toggle", dependencies.audit),
        dependencies.auth, validateRequest({ params }), async (request, response) => {
            const context = contextOf(request);
            if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
            const result = await dependencies.service.toggleLike(context, request.params.productId);
            if (result.kind !== "like_status") { reject(response, result); return; }
            response.status(200).json({ EM: "Like status updated", EC: 0, DT: result.isLiked });
        });
    router.get("/behavior/like-status/:productId", dependencies.auth, validateRequest({ params }), async (request, response) => {
        const context = contextOf(request);
        if (!context) { response.status(401).json({ EM: "Authentication required", EC: 3, DT: null }); return; }
        const result = await dependencies.service.getLikeStatus(context, request.params.productId);
        if (result.kind !== "like_status") { reject(response, result); return; }
        response.status(200).json({ EM: "Get like status successfully", EC: 0, DT: result.isLiked });
    });
    return router;
};
