import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/security/access-token.js";

describe("protected HTTP boundaries", () => {
    const protectedRequests = [
        () => request(createApp()).post("/api/v1/order/create").send({}),
        () => request(createApp()).post("/api/v1/cart/add").send({}),
        () => request(createApp()).post("/api/v1/review/add").send({}),
        () => request(createApp()).post("/api/v1/behavior/like/1").send({}),
        () => request(createApp()).post("/api/v1/conversation/create").send({}),
        () => request(createApp()).get("/api/v1/message/get/1"),
        () => request(createApp()).post("/api/v1/size/create").send({ name: "XL" }),
        () => request(createApp()).put("/api/v1/user/update-password/1").send({}),
        () => request(createApp()).put("/api/v1/admin/user/update/1").send({}),
    ];

    it.each(protectedRequests)("rejects an anonymous identity", async (send) => {
        const response = await send();
        expect(response.status).toBe(401);
    });

    it("rejects an unsigned payment webhook", async () => {
        const response = await request(createApp())
            .post("/api/v1/webhook")
            .send({ data: { description: "ORDER_1" } });

        expect(response.status).toBe(401);
        expect(response.body.EM).toBe("Invalid webhook signature");
    });

    it("returns field-level DTO errors before cart persistence", async () => {
        const token = signAccessToken({ userId: 1, role: "CUSTOMER" });
        const response = await request(createApp())
            .post("/api/v1/cart/add")
            .set("Authorization", `Bearer ${token}`)
            .send({ id: 7, sizeId: 2, quantity: 0, userId: 999 });

        expect(response.status).toBe(400);
        expect(response.body.EM).toBe("Request validation failed");
        expect(response.body.errors[0].path).toBe("body.quantity");
    });
});
