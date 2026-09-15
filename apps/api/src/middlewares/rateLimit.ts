import type { NextFunction, Request, Response } from "express";
import { getReadyRedisClient } from "../config/redis.js";
import { logger } from "../observability/logger.js";

type RateLimitOptions = {
    keyPrefix: string;
    maxRequests: number;
    windowSeconds: number;
};

const clientKey = (request: Request): string => {
    const forwarded = request.headers["x-forwarded-for"];
    const source = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    return (source?.trim() || request.ip || "unknown").replace(/[^a-zA-Z0-9_.:-]/g, "_");
};

export const rateLimit = ({ keyPrefix, maxRequests, windowSeconds }: RateLimitOptions) =>
    async (request: Request, response: Response, next: NextFunction): Promise<void> => {
        const redis = getReadyRedisClient();
        if (!redis) {
            logger.warn("rate_limit.redis_unavailable", {
                requestId: response.getHeader("X-Request-ID"),
                keyPrefix,
            });
            next();
            return;
        }

        try {
            const key = `${keyPrefix}:${clientKey(request)}`;
            const count = await redis.incr(key);
            if (count === 1) await redis.expire(key, windowSeconds);

            response.setHeader("X-RateLimit-Limit", maxRequests);
            response.setHeader("X-RateLimit-Remaining", Math.max(maxRequests - count, 0));
            if (count <= maxRequests) {
                next();
                return;
            }

            const retryAfter = await redis.ttl(key);
            response.setHeader("Retry-After", Math.max(retryAfter, 1));
            response.status(429).json({
                error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Please try again later.",
                },
            });
        } catch (error: unknown) {
            logger.error("rate_limit.failed", {
                requestId: response.getHeader("X-Request-ID"),
                error,
            });
            next();
        }
    };
