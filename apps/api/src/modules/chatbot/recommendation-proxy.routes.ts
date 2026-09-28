import axios from "axios";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import type { V2AuthenticatedRequest } from "../identity-access/interfaces/http/v2-auth.middleware.js";
import type { RequestHandler } from "express";

const productParams = z.object({ productId: z.string().regex(/^[1-9]\d{0,18}$/) }).strict();
const recommendationQuery = z.object({ num: z.coerce.number().int().min(1).max(50).default(10) }).strict();

const unavailable = { EM: "AI service unavailable", EC: 2, DT: null };
const recommendationRateLimit = () => rateLimit({
    keyPrefix: "rate-limit:recommendation",
    maxRequests: env.CHAT_RATE_LIMIT_MAX,
    windowSeconds: env.CHAT_RATE_LIMIT_WINDOW_SECONDS,
    failClosed: env.NODE_ENV === "production",
});

/** Browser-facing recommendation proxy. The browser never receives the private AI service URL. */
export const createRecommendationProxyRouter = (dependencies: { auth: RequestHandler }): Router => {
    const router = Router();
    router.get("/product/recommend/:productId", recommendationRateLimit(),
        validateRequest({ params: productParams }), async (request, response) => {
        try {
            const upstream = await axios.get(`${env.AI_SERVICE_URL}/recommend/${request.params.productId}`, {
                timeout: env.AI_SERVICE_TIMEOUT_MS,
            });
            response.status(200).json({ EM: "Get recommended products successfully", EC: 0, DT: upstream.data });
        } catch {
            response.status(502).json(unavailable);
        }
    });
    router.get("/recommend-product", recommendationRateLimit(), dependencies.auth,
        validateRequest({ query: recommendationQuery }),
        async (request, response) => {
            const context = (request as V2AuthenticatedRequest).v2AccessContext!;
            try {
                const upstream = await axios.get(`${env.AI_SERVICE_URL}/recommend-product-for-user`, {
                    params: { userId: context.accountId, num: request.query.num },
                    timeout: env.AI_SERVICE_TIMEOUT_MS,
                });
                const payload = upstream.data as { recommendations?: unknown };
                response.status(200).json({ EM: "Get personalized recommendations successfully", EC: 0,
                    DT: Array.isArray(payload.recommendations) ? payload.recommendations : [] });
            } catch {
                response.status(502).json(unavailable);
            }
        });
    return router;
};
