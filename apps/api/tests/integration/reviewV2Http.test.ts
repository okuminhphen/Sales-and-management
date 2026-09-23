import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { ReviewCommandV2Service } from "../../src/modules/review/application/review-command-v2.service.js";
import { ReviewQueryV2Service } from "../../src/modules/review/application/review-query-v2.service.js";
import { createReviewV2Router } from "../../src/modules/review/interfaces/http/review-v2.routes.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const customer: V2AccessContext = {
    accountId: "1", customerId: "3", employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const setup = () => {
    const submittedBy: string[] = [];
    const submittedProducts: string[] = [];
    const command = new ReviewCommandV2Service({ repository: {
        create: async (customerId, productId) => {
            submittedBy.push(customerId);
            submittedProducts.push(productId);
            return { kind: "created", reviewId: serializeEntityId("9") };
        },
    } });
    const query = new ReviewQueryV2Service({ repository: {
        listByProductId: async () => ({
            items: [{ id: serializeEntityId("9"), rating: 5, comment: "Tốt",
                authorUsername: "buyer", createdAt: "2026-09-23T00:00:00.000Z" }],
            page: 1, limit: 20, totalItems: 1, totalPages: 1,
        }),
    } });
    const auth = createV2AuthMiddleware({
        accessContexts: { findActiveByAccountId: async () => customer },
        verifyToken: () => ({ version: 2, accountId: serializeEntityId("1"),
            customerId: serializeEntityId("999"), employeeId: null,
            roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }] }),
    });
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createReviewV2Router({ auth, command, query }));
    return { app, submittedBy, submittedProducts };
};

describe("Review V2 HTTP compatibility", () => {
    it("returns legacy display fields without customer/account IDs", async () => {
        const { app } = setup();
        const response = await request(app).get("/api/v1/review/product/7");
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            EC: 0,
            DT: [{ id: "9", rating: 5, reviewText: "Tốt", user: { username: "buyer" } }],
            pagination: { page: 1, limit: 20, totalItems: 1 },
        });
        expect(response.body.DT[0]).not.toHaveProperty("customerId");
        expect(response.body.DT[0]).not.toHaveProperty("accountId");
    });

    it("requires V2 auth and takes customer ownership only from DB-derived context", async () => {
        const { app, submittedBy } = setup();
        await request(app).post("/api/v1/review/add")
            .send({ productId: "7", rating: 5, comment: "Tốt" }).expect(401);
        const response = await request(app).post("/api/v1/review/add")
            .set("Authorization", "Bearer signed-token")
            .send({ productId: "7", rating: 5, comment: "Tốt", userId: "999" });
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ EC: 0, DT: { id: "9" } });
        expect(submittedBy).toEqual(["3"]);
    });

    it("rejects unsafe IDs and invalid body before persistence", async () => {
        const { app, submittedBy } = setup();
        await request(app).get("/api/v1/review/product/900719925474099300000").expect(400);
        await request(app).post("/api/v1/review/add")
            .set("Authorization", "Bearer signed-token")
            .send({ productId: 9007199254740992, rating: 5, comment: "Tốt" }).expect(400);
        await request(app).post("/api/v1/review/add")
            .set("Authorization", "Bearer signed-token")
            .send({ productId: 7, rating: 6, comment: "Tốt" }).expect(400);
        expect(submittedBy).toEqual([]);
    });

    it("accepts a legacy safe numeric product ID and converts it to the V2 string contract", async () => {
        const { app, submittedBy, submittedProducts } = setup();
        const response = await request(app).post("/api/v1/review/add")
            .set("Authorization", "Bearer signed-token")
            .send({ productId: 7, rating: 5, comment: "Tốt" });
        expect(response.status).toBe(201);
        expect(submittedBy).toEqual(["3"]);
        expect(submittedProducts).toEqual(["7"]);
    });
});
