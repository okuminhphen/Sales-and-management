import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createBranchV2Router } from "../../src/modules/identity-access/interfaces/http/branch-v2.routes.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("Branch V2 HTTP routes", () => {
    it("keeps the pickup directory public and allowlisted without invoking backoffice auth", async () => {
        const auth = vi.fn((_request, _response, next) => next());
        const service = {
            listPickup: vi.fn(async () => ({
                kind: "pickup_branches" as const,
                page: {
                    branches: [{ id: serializeEntityId("2"), name: "HappyShop Hà Nội", address: "1 Phố Huế", type: "branch" as const }],
                    page: 1, limit: 100, totalItems: 1, totalPages: 1,
                },
            })),
        };
        const app = express();
        app.use(createBranchV2Router({ auth, service: service as never }));

        const response = await request(app).get("/branch/pickup/read?page=1&limit=100").expect(200);

        expect(auth).not.toHaveBeenCalled();
        expect(response.body).toEqual({
            EM: "Get pickup branches successfully", EC: 0,
            DT: [{ id: "2", name: "HappyShop Hà Nội", address: "1 Phố Huế", type: "branch" }],
            pagination: { page: 1, limit: 100, totalItems: 1, totalPages: 1 },
        });
    });
});
