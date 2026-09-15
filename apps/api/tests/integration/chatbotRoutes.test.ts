import axios from "axios";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

describe("chatbot HTTP boundary", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("proxies a validated message to the private AI service with its request id", async () => {
        const post = vi.spyOn(axios, "post").mockResolvedValue({
            data: { reply: "Chào bạn", products: [] },
        });

        const response = await request(createApp())
            .post("/api/v1/bot/chat")
            .set("X-Request-ID", "chat-contract-123")
            .send({ message: "Tìm đồ ngủ" });

        expect(response.status).toBe(200);
        expect(response.headers["x-request-id"]).toBe("chat-contract-123");
        expect(response.body).toEqual({ reply: "Chào bạn", products: [] });
        expect(post).toHaveBeenCalledWith(
            "http://localhost:8000/chat",
            { message: "Tìm đồ ngủ", history: [] },
            expect.objectContaining({
                headers: { "X-Request-ID": "chat-contract-123" },
                timeout: 10_000,
            }),
        );
    });

    it("does not expose an upstream AI error", async () => {
        vi.spyOn(axios, "post").mockRejectedValue(new axios.AxiosError("AI unavailable"));

        const response = await request(createApp())
            .post("/api/v1/bot/chat")
            .send({ message: "Tìm đồ ngủ" });

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            EM: "AI service unavailable",
            EC: 2,
            DT: null,
        });
    });
});
