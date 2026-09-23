import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { rateLimit } from "../../src/middlewares/rateLimit.js";
import { logger } from "../../src/observability/logger.js";
import * as redisModule from "../../src/config/redis.js";

describe("Rate Limit Security & Policy (Required 5)", () => {
    it("does not blindly trust client X-Forwarded-For header when trust proxy is false", async () => {
        const app = express();
        app.set("trust proxy", false);

        let capturedKey = "";
        const mockRedis = {
            incr: vi.fn().mockImplementation((key: string) => {
                capturedKey = key;
                return Promise.resolve(1);
            }),
            expire: vi.fn().mockResolvedValue(1),
            ttl: vi.fn().mockResolvedValue(60),
        };

        vi.spyOn(redisModule, "getReadyRedisClient").mockReturnValue(mockRedis as any);

        app.use(
            rateLimit({
                keyPrefix: "test-spoof",
                maxRequests: 5,
                windowSeconds: 60,
            })
        );
        app.get("/test", (_req, res) => res.json({ ok: true }));

        // Client attempts to spoof IP by injecting arbitrary header
        await request(app)
            .get("/test")
            .set("X-Forwarded-For", "203.0.113.195, 70.41.3.18");

        // Key should NOT contain the forged IP "203.0.113.195"
        expect(capturedKey).not.toContain("203.0.113.195");
        expect(capturedKey).toMatch(/test-spoof:(::ffff:)?127\.0\.0\.1|test-spoof:::1|test-spoof:unknown/);
    });

    it("fails open and logs warning when Redis is unavailable", async () => {
        const app = express();
        const warnSpy = vi.spyOn(logger, "warn");

        // Simulate Redis being unavailable
        vi.spyOn(redisModule, "getReadyRedisClient").mockReturnValue(null);

        app.use(
            rateLimit({
                keyPrefix: "test-unavailable",
                maxRequests: 5,
                windowSeconds: 60,
            })
        );
        app.get("/test-unavail", (_req, res) => res.json({ status: "alive" }));

        const response = await request(app).get("/test-unavail");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "alive" });
        expect(warnSpy).toHaveBeenCalledWith(
            "rate_limit.redis_unavailable",
            expect.objectContaining({ keyPrefix: "test-unavailable" })
        );
    });
});
