import axios from "axios";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { createRecommendationProxyRouter } from "../../src/modules/chatbot/recommendation-proxy.routes.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";

const app = () => createApp({ apiRouter: createRecommendationProxyRouter({
    auth: (request, _response, next) => {
        (request as V2AuthenticatedRequest).v2AccessContext = {
            accountId: "42", customerId: "7", employeeId: null, grants: [],
        };
        next();
    },
}) });

describe("AI recommendation proxy", () => {
    afterEach(() => vi.restoreAllMocks());

    it("proxies similar-product lookup without exposing the AI URL to the browser", async () => {
        const get = vi.spyOn(axios, "get").mockResolvedValue({ data: [{ id: "9" }] });
        const response = await request(app()).get("/api/v1/product/recommend/8");

        expect(response.status).toBe(200);
        expect(response.body.DT).toEqual([{ id: "9" }]);
        expect(get).toHaveBeenCalledWith("http://localhost:8000/recommend/8", { timeout: 10_000 });
    });

    it("derives personalized recommendation identity from V2 auth context", async () => {
        const get = vi.spyOn(axios, "get").mockResolvedValue({ data: { recommendations: [] } });
        const response = await request(app()).get("/api/v1/recommend-product?num=5");

        expect(response.status).toBe(200);
        expect(get).toHaveBeenCalledWith("http://localhost:8000/recommend-product-for-user", {
            params: { userId: "42", num: 5 }, timeout: 10_000,
        });
    });
});
