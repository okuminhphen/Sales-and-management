import request from "supertest";
import { Router } from "express";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

describe("health endpoint", () => {
    it.each([
        ["malformed JSON", "{", 400, "INVALID_JSON"],
        ["oversized JSON", JSON.stringify({ value: "x".repeat(1_048_600) }), 413, "PAYLOAD_TOO_LARGE"],
    ])("returns a safe client error for %s", async (_label, body, status, code) => {
        const response = await request(createApp()).post("/unknown")
            .set("Content-Type", "application/json").send(body);
        expect(response.status).toBe(status);
        expect(response.body.error).toMatchObject({ code, requestId: response.headers["x-request-id"] });
        expect(response.body.error).not.toHaveProperty("stack");
        expect(response.body).not.toHaveProperty("body");
    });

    it("does not trust an arbitrary status on an internal exception", async () => {
        const api = Router();
        api.get("/fail", (_req, _res, next) => next(Object.assign(new Error("private details"), { status: 400 })));
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            const response = await request(createApp({ apiRouter: api })).get("/api/v1/fail");
            expect(response.status).toBe(500);
            expect(response.body.error.code).toBe("INTERNAL_ERROR");
            expect(JSON.stringify(response.body)).not.toContain("private details");
        } finally { spy.mockRestore(); }
    });
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

    it("mounts an injected API router without loading legacy routes", async () => {
        const api = Router();
        api.get("/runtime-probe", (_request, response) => {
            response.status(200).json({ persistence: "v2" });
        });

        const response = await request(createApp({ apiRouter: api })).get("/api/v1/runtime-probe");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ persistence: "v2" });
    });
});
