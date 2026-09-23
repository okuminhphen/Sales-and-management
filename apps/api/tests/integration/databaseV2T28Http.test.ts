import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { createCatalogCommerceV2Router } from "../../src/routes/catalog-commerce-v2.js";
import { signV2AccessToken } from "../../src/security/v2-access-token.js";
import { requestContext } from "../../src/middlewares/requestContext.js";
import { SequelizeCustomerAuthV2Repository } from "../../src/modules/identity-access/persistence/customer-auth-v2.repository.js";
import type { CatalogMediaProvider } from "../../src/modules/catalog/application/catalog-media-provider.js";
import type { V2HttpAuditEntry } from "../../src/observability/v2-http-audit.js";

const run = process.env.RUN_DATABASE_V2_TESTS === "true";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

describe.skipIf(!run)("T28 HTTP with signed V2 JWT and real MySQL", () => {
    let sequelize: Sequelize;
    let app: express.Express;
    let adminToken: string;
    let ownerToken: string;
    let otherToken: string;
    let adminId: string;
    let ownerId: string;
    let productId: string;
    let sizeId: string;
    const audits: V2HttpAuditEntry[] = [];
    const deleted: string[] = [];
    let uploadMode: "ok" | "fail" | "reservation_claimed" = "ok";
    let lastUploadId = "";
    const provider: CatalogMediaProvider = {
        upload: async (_file, publicId) => {
            lastUploadId = publicId;
            if (uploadMode === "fail") return { kind: "provider_error", message: "provider-private-detail" };
            if (uploadMode === "reservation_claimed") {
                await sequelize.query("UPDATE outbox_events SET locked_at = UTC_TIMESTAMP(3), attempts = 1 WHERE aggregate_id = ?",
                    { replacements: [publicId] });
            }
            return { kind: "uploaded", asset: { publicId, url: `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg` } };
        },
        delete: async (publicId) => { deleted.push(publicId); return { kind: "deleted" }; },
    };
    const one = async <T extends object>(sql: string, replacements: unknown[] = []): Promise<T> => {
        const rows = await sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing T28 test fixture");
        return rows[0];
    };
    const token = (accountId: string) => signV2AccessToken({ version: 2, accountId,
        customerId: "999", employeeId: null,
        // Deliberately misleading hints: DB-derived grants/ownership must win.
        roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }] });

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await sequelize.authenticate();
        const adminEmail = `t28-admin-${suffix}@example.test`;
        await seedV2Database(sequelize, { email: adminEmail, password: "test-only-t28-admin-password" });
        adminId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [adminEmail])).id;
        const persistence = createSalesV2Persistence(sequelize);
        const identities = new SequelizeCustomerAuthV2Repository(persistence);
        const customers: string[] = [];
        for (const kind of ["owner", "other"]) {
            const result = await identities.registerVerifiedCustomer({
                email: `t28-${kind}-${suffix}@example.test`, username: `t28_${kind}_${suffix}`,
                phone: "0900000000", passwordHash: "test-only-not-used-for-login",
            });
            if (result.kind !== "created") throw new Error("Could not create test identity");
            customers.push(result.accountId);
        }
        ownerId = customers[0]!;
        adminToken = token(adminId); ownerToken = token(ownerId); otherToken = token(customers[1]!);
        await sequelize.query("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'T28 HTTP', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`T28_${suffix}`, `t28-${suffix}`] });
        const category = await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`T28_${suffix}`]);
        await sequelize.query("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'T28 product', ?, '125000.0000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [category.id, `t28-product-${suffix}`] });
        productId = (await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`t28-product-${suffix}`])).id;
        await sequelize.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`T28 ${suffix}`] });
        sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`T28 ${suffix}`])).id;
        await sequelize.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [productId, sizeId, `T28-${suffix}`] });
        app = express();
        app.use(requestContext, express.json());
        app.use("/api/v1", createCatalogCommerceV2Router({ persistence, mediaProvider: provider,
            cleanupLog: { recordFailedCleanup: () => {} }, audit: (entry) => audits.push(entry) }));
    });
    afterAll(async () => { await sequelize?.close(); });

    it("creates, replaces and deletes banner media atomically and audits verified actor", async () => {
        await request(app).post("/api/v1/banner/create").field("name", "Unauthorized").expect(401);
        await request(app).post("/api/v1/banner/create").set("Authorization", `Bearer ${ownerToken}`)
            .field("name", "No admin grant").attach("banner", jpeg, "test.jpg").expect(403);
        const created = await request(app).post("/api/v1/banner/create").set("Authorization", `Bearer ${adminToken}`)
            .set("X-Request-ID", "t28-banner-create").field("name", `T28 banner ${suffix}`)
            .field("url", "/products").field("status", "active").attach("banner", jpeg, "hero.jpg").expect(200);
        const id: string = created.body.DT.id;
        const first = await one<{ name: string; image: { publicId: string }; status: string }>("SELECT name, image, status FROM banners WHERE id = ?", [id]);
        expect(first).toMatchObject({ name: `T28 banner ${suffix}`, status: "active" });
        const reservation = await one<{ publishedAt: Date | null }>("SELECT published_at AS publishedAt FROM outbox_events WHERE aggregate_id = ?", [first.image.publicId]);
        expect(reservation.publishedAt).not.toBeNull();
        const read = await request(app).get("/api/v1/banner/read/active?limit=100").expect(200);
        expect(read.body.DT).toEqual(expect.arrayContaining([expect.objectContaining({ id, url: "/products", image: { url: expect.any(String) } })]));
        await request(app).put(`/api/v1/banner/update/${id}`).set("Authorization", `Bearer ${adminToken}`)
            .field("name", "Updated").attach("banner", jpeg, "replacement.jpg").expect(200);
        const updated = await one<{ name: string; image: { publicId: string } }>("SELECT name, image FROM banners WHERE id = ?", [id]);
        expect(updated.name).toBe("Updated");
        expect(updated.image.publicId).not.toBe(first.image.publicId);
        expect(deleted).toContain(first.image.publicId);
        await request(app).delete(`/api/v1/banner/delete/${id}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
        expect((await one<{ total: string }>("SELECT COUNT(*) AS total FROM banners WHERE id = ?", [id])).total).toBe("0");
        const jobs = await sequelize.query<{ aggregateId: string }>("SELECT aggregate_id AS aggregateId FROM outbox_events WHERE event_type = 'catalog.banner.media_cleanup_requested' AND aggregate_id IN (?, ?)",
            { replacements: [first.image.publicId, updated.image.publicId], type: QueryTypes.SELECT });
        expect(jobs).toHaveLength(2);
        expect(audits).toContainEqual(expect.objectContaining({ action: "banner.create", accountId: adminId,
            resourceId: id, requestId: "t28-banner-create", outcome: "succeeded" }));
    });

    it("preserves metadata and image on provider failure or a claimed reservation", async () => {
        const name = `T28 rollback ${suffix}`;
        const created = await request(app).post("/api/v1/banner/create").set("Authorization", `Bearer ${adminToken}`)
            .send({ name, url: "/before" }).expect(200);
        const id: string = created.body.DT.id;
        try {
            for (const mode of ["fail", "reservation_claimed"] as const) {
                uploadMode = mode;
                await request(app).put(`/api/v1/banner/update/${id}`).set("Authorization", `Bearer ${adminToken}`)
                    .field("name", "Must rollback").field("url", "/after").attach("banner", jpeg, "test.jpg").expect(503);
                expect(await one("SELECT name, target_url AS targetUrl, image FROM banners WHERE id = ?", [id]))
                    .toMatchObject({ name, targetUrl: "/before", image: null });
                expect((await one<{ publishedAt: Date | null }>("SELECT published_at AS publishedAt FROM outbox_events WHERE aggregate_id = ?", [lastUploadId])).publishedAt).toBeNull();
            }
            const rejectedName = `T28 rejected ${suffix}`;
            await request(app).post("/api/v1/banner/create").set("Authorization", `Bearer ${adminToken}`)
                .field("name", rejectedName).attach("banner", jpeg, "test.jpg").expect(503);
            expect((await one<{ total: string }>("SELECT COUNT(*) AS total FROM banners WHERE name = ?", [rejectedName])).total).toBe("0");
        } finally { uploadMode = "ok"; }
        await request(app).delete(`/api/v1/banner/delete/${id}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
    });

    it("uses DB ownership for cart and review despite forged JWT hints and browser IDs", async () => {
        await request(app).post("/api/v1/cart/add").set("Authorization", `Bearer ${ownerToken}`)
            .send({ id: productId, sizeId, quantity: 2, userId: "999" }).expect(200);
        const read = await request(app).get("/api/v1/cart/read/999").set("Authorization", `Bearer ${ownerToken}`).expect(200);
        expect(read.body.DT).toHaveLength(1);
        expect(read.body.DT[0]).toMatchObject({ price: "125000.0000", quantity: 2, productId });
        const itemId: string = read.body.DT[0].id;
        await request(app).put("/api/v1/cart/update").set("Authorization", `Bearer ${otherToken}`)
            .send({ cartProductSizeId: itemId, quantity: 9 }).expect(404);
        await request(app).put("/api/v1/cart/update").set("Authorization", `Bearer ${ownerToken}`)
            .send({ cartProductSizeId: itemId, quantity: 3 }).expect(200);
        await request(app).delete(`/api/v1/cart/delete/${itemId}`).set("Authorization", `Bearer ${otherToken}`).expect(404);
        const review = await request(app).post("/api/v1/review/add").set("Authorization", `Bearer ${ownerToken}`)
            .send({ productId, rating: 5, comment: "Private review content", userId: "999" }).expect(201);
        const saved = await one<{ accountId: string }>("SELECT customers.account_id AS accountId FROM reviews JOIN customers ON customers.id = reviews.customer_id WHERE reviews.id = ?", [review.body.DT.id]);
        expect(saved.accountId).toBe(ownerId);
        await request(app).post("/api/v1/review/add").set("Authorization", `Bearer ${ownerToken}`)
            .send({ productId, rating: 5, comment: "duplicate" }).expect(409);
        const listed = await request(app).get(`/api/v1/review/product/${productId}`).expect(200);
        expect(listed.body.DT).toHaveLength(1);
        expect(listed.body.DT[0]).not.toHaveProperty("customerId");
        await request(app).delete(`/api/v1/cart/delete/${itemId}`).set("Authorization", `Bearer ${ownerToken}`).expect(200);
        expect(audits).toContainEqual(expect.objectContaining({ action: "review.create", accountId: ownerId, resourceId: review.body.DT.id, outcome: "succeeded" }));
        expect(audits).toContainEqual(expect.objectContaining({ action: "cart.update", accountId: ownerId, resourceId: itemId, outcome: "succeeded" }));
        expect(JSON.stringify(audits)).not.toMatch(/Private review content|Bearer|password/);
    });

    it("never deletes a committed image when the DB commit acknowledgement is lost", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const uncertainPersistence = { ...persistence,
            inTransaction: async <T,>(work: Parameters<typeof persistence.inTransaction<T>>[0]): Promise<T> => {
                await persistence.inTransaction(work);
                throw new Error("Simulated lost commit acknowledgement");
            },
        };
        const uncertainApp = express();
        uncertainApp.use(express.json());
        uncertainApp.use("/api/v1", createCatalogCommerceV2Router({ persistence: uncertainPersistence,
            mediaProvider: provider, cleanupLog: { recordFailedCleanup: () => {} }, audit: () => {} }));
        const name = `T28 uncertain ${suffix}`;
        const deletionsBefore = deleted.length;
        await request(uncertainApp).post("/api/v1/banner/create").set("Authorization", `Bearer ${adminToken}`)
            .field("name", name).attach("banner", jpeg, "hero.jpg").expect(503);
        const saved = await one<{ id: string; image: { publicId: string } }>("SELECT id, image FROM banners WHERE name = ?", [name]);
        expect(saved.image.publicId).toBe(lastUploadId);
        expect(deleted.slice(deletionsBefore)).not.toContain(saved.image.publicId);
        expect((await one<{ publishedAt: Date | null }>("SELECT published_at AS publishedAt FROM outbox_events WHERE aggregate_id = ?", [lastUploadId])).publishedAt).not.toBeNull();
        await request(app).delete(`/api/v1/banner/delete/${saved.id}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
    });

    it("rejects invalid JWTs and disabled accounts even when signed claims still exist", async () => {
        await request(app).get("/api/v1/cart/read/not-an-id").set("Authorization", `Bearer ${ownerToken}`).expect(400);
        await request(app).get("/api/v1/review/product/not-an-id").expect(400);
        await request(app).get("/api/v1/banner/read").set("Authorization", "Bearer invalid-token").expect(401);
        await sequelize.query("UPDATE accounts SET status = 'locked' WHERE id = ?", { replacements: [ownerId] });
        try {
            await request(app).post("/api/v1/cart/add").set("Authorization", `Bearer ${ownerToken}`)
                .send({ id: productId, sizeId, quantity: 1 }).expect(401);
        } finally {
            await sequelize.query("UPDATE accounts SET status = 'active' WHERE id = ?", { replacements: [ownerId] });
        }
    });
});
