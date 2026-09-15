import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("health endpoint", () => {
    it("returns liveness without external dependencies", async () => {
        const response = await request(createApp()).get("/health/live");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok" });
        expect(response.headers["x-request-id"]).toMatch(/^[a-zA-Z0-9_-]{8,128}$/);
    });

    it("returns a stable JSON error for unknown routes", async () => {
        const response = await request(createApp()).get("/does-not-exist");

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe("NOT_FOUND");
    });
});
