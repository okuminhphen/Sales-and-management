import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { CatalogBannerCommandV2Service, type CatalogBannerCommandV2Repository } from "../../src/modules/catalog/application/catalog-banner-command-v2.service.js";
import { CatalogBannerQueryV2Service } from "../../src/modules/catalog/application/catalog-banner-query-v2.service.js";
import { CatalogBannerAdminQueryV2Service } from "../../src/modules/catalog/application/catalog-banner-admin-query-v2.service.js";
import { createBannerV2Router } from "../../src/modules/catalog/interfaces/http/banner-v2.routes.js";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";
import type { MediaUploadInput } from "../../src/modules/catalog/application/catalog-media-provider.js";

const manager: V2AccessContext = { accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }] };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const setup = (context = manager) => {
    const repository: CatalogBannerCommandV2Repository = {
        reserveUpload: vi.fn(async () => {}),
        create: vi.fn<CatalogBannerCommandV2Repository["create"]>(async () => ({ kind: "created", bannerId: serializeEntityId("9007199254740993") })),
        update: vi.fn<CatalogBannerCommandV2Repository["update"]>(async () => ({ kind: "updated", oldPublicId: "banners/old" })),
        deleteWithoutMedia: vi.fn<CatalogBannerCommandV2Repository["deleteWithoutMedia"]>(async () => ({ kind: "deleted" })),
        setImage: vi.fn<CatalogBannerCommandV2Repository["setImage"]>(async () => ({ kind: "image_set", oldPublicId: null })),
        clearImageAndDelete: vi.fn<CatalogBannerCommandV2Repository["clearImageAndDelete"]>(async () => ({ kind: "deleted", oldPublicId: "banners/old" })),
    };
    const media = {
        upload: vi.fn(async (_file: MediaUploadInput, publicId: string) => ({ kind: "uploaded" as const,
            asset: { publicId, url: "https://res.cloudinary.com/demo/image/upload/new.jpg" } })),
        delete: vi.fn(async (_id: string) => ({ kind: "deleted" as const })),
    };
    const page = { banners: [{ id: serializeEntityId("9007199254740993"), name: "Sale",
        targetUrl: "/products", image: { url: "https://example.test/banner.jpg" }, status: "inactive" as const }],
        page: 1, limit: 20, totalItems: 1, totalPages: 1 };
    const active = vi.fn(async () => ({ ...page, banners: [] }));
    const all = vi.fn(async () => page);
    const auth = createV2AuthMiddleware({
        accessContexts: { findActiveByAccountId: async () => context },
        verifyToken: () => ({ version: 2, accountId: serializeEntityId(context.accountId), customerId: null,
            employeeId: null, roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }] }),
    });
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createBannerV2Router({ auth,
        command: new CatalogBannerCommandV2Service({ repository, mediaProvider: media, cleanupLog: { recordFailedCleanup: () => {} } }),
        query: new CatalogBannerQueryV2Service({ repository: { listActive: active } }),
        adminQuery: new CatalogBannerAdminQueryV2Service({ repository: { listAll: all } }),
    }));
    return { app, repository, media, active, all };
};

describe("Banner V2 HTTP compatibility", () => {
    it("keeps public reads active-only and protects the admin directory", async () => {
        const { app, active, all } = setup();
        await request(app).get("/api/v1/banner/read/active").expect(200);
        await request(app).get("/api/v1/banner/read").expect(401);
        const response = await request(app).get("/api/v1/banner/read").set("Authorization", "Bearer signed").expect(200);
        expect(response.body).toMatchObject({ EC: 0, DT: [{ id: "9007199254740993", url: "/products", status: "inactive" }],
            pagination: { limit: 20, totalItems: 1 } });
        expect(response.body.DT[0].image).not.toHaveProperty("publicId");
        expect(active).toHaveBeenCalledOnce();
        expect(all).toHaveBeenCalledOnce();
    });

    it("authorizes from database grants before reading or uploading multipart data", async () => {
        for (const context of [
            { ...manager, grants: [] },
            { ...manager, grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch" as const, branchId: "2" }, permissions: ["catalog.manage.global"] }] },
            { ...manager, grants: [{ roleCode: "CUSTOMER", scope: { type: "global" as const }, permissions: ["catalog.manage.global"] }] },
        ]) {
            const { app, media, repository } = setup(context);
            await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
                .field("name", "Sale").attach("banner", jpeg, "test.jpg").expect(403);
            expect(media.upload).not.toHaveBeenCalled();
            expect(repository.create).not.toHaveBeenCalled();
        }
    });

    it("creates metadata and an uploaded image in one persistence call", async () => {
        const { app, repository, media } = setup();
        const response = await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
            .field("name", " Sale ").field("url", "/products").field("status", "active")
            .attach("banner", jpeg, "test.jpg").expect(200);
        expect(response.body).toMatchObject({ EC: 0, DT: { id: "9007199254740993" } });
        expect(repository.create).toHaveBeenCalledWith({ name: "Sale", targetUrl: "/products", status: "active" },
            expect.objectContaining({ publicId: expect.stringMatching(/^banners\//) }));
        expect(repository.setImage).not.toHaveBeenCalled();
        expect(media.upload).toHaveBeenCalledOnce();
    });

    it("updates image-only requests and cleans the old image after persistence", async () => {
        const { app, repository, media } = setup();
        await request(app).put("/api/v1/banner/update/7").set("Authorization", "Bearer signed")
            .attach("banner", jpeg, "test.jpg").expect(200);
        expect(repository.update).toHaveBeenCalledWith("7", {}, expect.objectContaining({ publicId: expect.any(String) }));
        expect(media.delete).toHaveBeenCalledWith("banners/old");
    });

    it("supports metadata-only requests and preserves the legacy response envelope", async () => {
        const { app, repository, media } = setup();
        await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
            .send({ name: "Sale", url: "", status: "inactive" }).expect(200);
        expect(repository.create).toHaveBeenCalledWith({ name: "Sale", targetUrl: null, status: "inactive" });
        await request(app).delete("/api/v1/banner/delete/7").set("Authorization", "Bearer signed").expect(200);
        expect(media.upload).not.toHaveBeenCalled();
    });

    it("rejects invalid IDs, URLs, unknown fields and empty patches before provider calls", async () => {
        const { app, media, repository } = setup();
        for (const body of [{ name: "Sale", url: "javascript:alert(1)" }, { name: "Sale", image: { publicId: "banners/other" } },
            { name: "Sale", accountId: "999" }, { name: "" }]) {
            await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed").send(body).expect(400);
        }
        await request(app).put("/api/v1/banner/update/7").set("Authorization", "Bearer signed").send({}).expect(400);
        await request(app).delete("/api/v1/banner/delete/9223372036854775808").set("Authorization", "Bearer signed").expect(400);
        await request(app).delete("/api/v1/banner/delete/not-an-id").set("Authorization", "Bearer signed").expect(400);
        await request(app).get("/api/v1/banner/read/active?limit=101").expect(400);
        expect(repository.create).not.toHaveBeenCalled();
        expect(media.upload).not.toHaveBeenCalled();
    });

    it("rejects oversized, forged and unexpected file fields before persistence", async () => {
        const { app, repository, media } = setup();
        await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
            .field("name", "Sale").attach("banner", Buffer.alloc(5 * 1024 * 1024 + 1), "large.jpg").expect(413);
        await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
            .field("name", "Sale").attach("banner", Buffer.from("not an image"), "forged.jpg").expect(400);
        await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
            .field("name", "Sale").attach("wrong", jpeg, "test.jpg").expect(400);
        expect(repository.create).not.toHaveBeenCalled();
        expect(media.upload).not.toHaveBeenCalled();
    });

    it("does not write metadata when the provider fails", async () => {
        const { app, repository, media } = setup();
        media.upload.mockRejectedValueOnce(new Error("private provider detail"));
        const response = await request(app).put("/api/v1/banner/update/7").set("Authorization", "Bearer signed")
            .field("name", "Changed").attach("banner", jpeg, "test.jpg").expect(503);
        expect(repository.update).not.toHaveBeenCalled();
        expect(JSON.stringify(response.body)).not.toContain("private provider detail");
    });

    it("maps database errors safely and leaves cleanup to the durable worker", async () => {
        const { app, repository, media } = setup();
        vi.mocked(repository.create).mockRejectedValueOnce(new Error("SQL private detail"));
        const response = await request(app).post("/api/v1/banner/create").set("Authorization", "Bearer signed")
            .field("name", "Sale").attach("banner", jpeg, "test.jpg").expect(503);
        expect(media.delete).not.toHaveBeenCalled();
        expect(repository.reserveUpload).toHaveBeenCalledOnce();
        expect(JSON.stringify(response.body)).not.toContain("SQL private detail");
    });
});
