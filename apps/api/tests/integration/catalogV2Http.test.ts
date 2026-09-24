import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { createCatalogV2Router } from "../../src/routes/catalog-v2.js";
import { signV2AccessToken } from "../../src/security/v2-access-token.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Catalog V2 HTTP on MySQL", () => {
    let sequelize: Sequelize;
    let app: express.Express;
    let categoryId: string;
    let productId: string;
    let inactiveProductId: string;
    let variantId: string;
    let adminBearer: string;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await sequelize.authenticate();
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const adminEmail = `catalog-admin-${suffix}@example.test`;
        await seedV2Database(sequelize, { email: adminEmail, password: "catalog-admin-password-123" });
        const adminId = (await sequelize.query<{ id: string }>("SELECT id FROM accounts WHERE email = ?", {
            replacements: [adminEmail], type: QueryTypes.SELECT,
        }))[0]!.id;
        adminBearer = `Bearer ${signV2AccessToken({ version: 2, accountId: adminId,
            customerId: null, employeeId: null, roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }] })}`;
        const code = `HTTP_CAT_${suffix}`;
        const slug = `http-cat-${suffix}`;
        const productSlug = `http-product-${suffix}`;
        const inactiveSlug = `http-inactive-${suffix}`;
        const sizeName = `HTTP SIZE ${suffix}`;
        await sequelize.query("INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, ?, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", {
            replacements: [code, "HTTP category", slug],
        });
        categoryId = (await sequelize.query<{ id: string }>("SELECT id FROM categories WHERE code = ?", {
            replacements: [code], type: QueryTypes.SELECT,
        }))[0]!.id;
        await sequelize.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", {
            replacements: [sizeName],
        });
        const sizeId = (await sequelize.query<{ id: string }>("SELECT id FROM sizes WHERE name = ?", {
            replacements: [sizeName], type: QueryTypes.SELECT,
        }))[0]!.id;
        await sequelize.query("INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, ?, NULL, ?, NULL, 'inactive', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", {
            replacements: [categoryId, "HTTP product", productSlug, "123.4500", categoryId, "Hidden product", inactiveSlug, "123.4500"],
        });
        const products = await sequelize.query<{ id: string; slug: string }>("SELECT id, slug FROM products WHERE slug IN (?, ?)", {
            replacements: [productSlug, inactiveSlug], type: QueryTypes.SELECT,
        });
        productId = products.find((product) => product.slug === productSlug)!.id;
        inactiveProductId = products.find((product) => product.slug === inactiveSlug)!.id;
        const sku = `HTTP-SKU-${suffix}`;
        await sequelize.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", {
            replacements: [productId, sizeId, sku],
        });
        variantId = (await sequelize.query<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", {
            replacements: [sku], type: QueryTypes.SELECT,
        }))[0]!.id;
        app = express();
        app.use(express.json());
        app.use("/api/v1", createCatalogV2Router({ persistence: createSalesV2Persistence(sequelize) }));
    });
    afterAll(async () => { await sequelize?.close(); });

    it("serves public directories with string IDs and decimal money", async () => {
        const categories = await request(app).get("/api/v1/category/read?page=1&limit=100").expect(200);
        expect(categories.body.DT).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]));
        expect(categories.body.pagination).toMatchObject({ page: 1, limit: 100 });
        const sizes = await request(app).get("/api/v1/size/read?page=1&limit=100").expect(200);
        expect(sizes.body.DT).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]));
        const products = await request(app).get("/api/v1/product/read?page=1&limit=100").expect(200);
        expect(products.body.DT).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.any(String), basePrice: expect.any(String) })]));
        expect(products.body.DT.some((product: { id: string }) => product.id === inactiveProductId)).toBe(false);
    });

    it("returns active detail and variants without leaking SKU or inventory", async () => {
        const detail = await request(app).get(`/api/v1/product/${productId}`).expect(200);
        expect(detail.body.DT).toMatchObject({ id: productId, categoryId, basePrice: "123.4500" });
        const variants = await request(app).get(`/api/v1/product/${productId}/variants`).expect(200);
        expect(variants.body.DT).toEqual([expect.objectContaining({ id: variantId, productId })]);
        expect(variants.body.DT[0]).not.toHaveProperty("sku");
        expect(variants.body.DT[0]).not.toHaveProperty("stock");
        await request(app).get(`/api/v1/product/${inactiveProductId}`).expect(404);
        await request(app).get(`/api/v1/product/${inactiveProductId}/variants`).expect(404);
    });

    it("validates input before database access", async () => {
        await request(app).get("/api/v1/category/read?limit=101").expect(400);
        await request(app).get("/api/v1/size/read?page=-1").expect(400);
        await request(app).get("/api/v1/product/read?limit=0").expect(400);
        await request(app).get("/api/v1/product/not-a-bigint").expect(400);
        await request(app).get("/api/v1/product/9223372036854775808/variants").expect(400);
    });

    it("requires a database-backed catalog grant for mutations and rejects hierarchy cycles", async () => {
        await request(app).post("/api/v1/category/create").send({ name: "No auth" }).expect(401);
        const root = await request(app).post("/api/v1/category/create")
            .set("Authorization", adminBearer).send({ name: "HTTP root" }).expect(200);
        const rootId: string = root.body.DT.id;
        const child = await request(app).post("/api/v1/category/create")
            .set("Authorization", adminBearer).send({ name: "HTTP child", parentId: rootId }).expect(200);
        const childId: string = child.body.DT.id;
        expect(typeof rootId).toBe("string");
        await request(app).put(`/api/v1/category/update/${rootId}`).set("Authorization", adminBearer)
            .send({ parentId: childId }).expect(409);
        await request(app).put(`/api/v1/category/update/${childId}`).set("Authorization", adminBearer)
            .send({ parentId: childId }).expect(409);
        await request(app).delete(`/api/v1/category/delete/${rootId}`)
            .set("Authorization", adminBearer).expect(409);
        await request(app).put(`/api/v1/category/update/${childId}`).set("Authorization", adminBearer)
            .send({ name: "Renamed child" }).expect(200);
        await request(app).delete(`/api/v1/category/delete/${childId}`)
            .set("Authorization", adminBearer).expect(200);
        await request(app).delete(`/api/v1/category/delete/${rootId}`)
            .set("Authorization", adminBearer).expect(200);
    });

    it("does not form a cycle when two reparenting requests race", async () => {
        const left = await request(app).post("/api/v1/category/create")
            .set("Authorization", adminBearer).send({ name: "Race left" }).expect(200);
        const right = await request(app).post("/api/v1/category/create")
            .set("Authorization", adminBearer).send({ name: "Race right" }).expect(200);
        const leftId: string = left.body.DT.id;
        const rightId: string = right.body.DT.id;
        const results = await Promise.all([
            request(app).put(`/api/v1/category/update/${leftId}`).set("Authorization", adminBearer)
                .send({ parentId: rightId }),
            request(app).put(`/api/v1/category/update/${rightId}`).set("Authorization", adminBearer)
                .send({ parentId: leftId }),
        ]);
        expect(results.filter((result) => result.status === 200)).toHaveLength(1);
        expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
        const rows = await sequelize.query<{ id: string; parentId: string | null }>(
            "SELECT id, parent_id AS parentId FROM categories WHERE id IN (?, ?)",
            { replacements: [leftId, rightId], type: QueryTypes.SELECT },
        );
        expect(rows.filter((row) => row.parentId !== null)).toHaveLength(1);
    });

    it("manages sizes without deleting one referenced by a variant", async () => {
        const name = `HTTP SIZE MUTATION ${crypto.randomUUID().slice(0, 8)}`;
        await request(app).post("/api/v1/size/create").send({ name }).expect(401);
        const created = await request(app).post("/api/v1/size/create")
            .set("Authorization", adminBearer).send({ name }).expect(200);
        const id: string = created.body.DT.id;
        await request(app).post("/api/v1/size/create")
            .set("Authorization", adminBearer).send({ name }).expect(409);
        await request(app).put("/api/v1/size/update").set("Authorization", adminBearer)
            .send({ id, name: `${name} UPDATED` }).expect(200);
        await request(app).delete(`/api/v1/size/delete/${id}`)
            .set("Authorization", adminBearer).expect(200);
        const referenced = await sequelize.query<{ sizeId: string }>(
            "SELECT size_id AS sizeId FROM product_variants WHERE id = ?",
            { replacements: [variantId], type: QueryTypes.SELECT },
        );
        await request(app).delete(`/api/v1/size/delete/${referenced[0]!.sizeId}`)
            .set("Authorization", adminBearer).expect(409);
    });

    it("writes product metadata and an outbox event atomically, then deactivates instead of deleting", async () => {
        await request(app).post("/api/v1/product/create").send({ name: "No auth" }).expect(401);
        await request(app).post("/api/v1/product/create").set("Authorization", adminBearer)
            .send({ name: "Wrong price", price: 12.5, categoryId }).expect(400);
        const created = await request(app).post("/api/v1/product/create").set("Authorization", adminBearer)
            .send({ name: "HTTP metadata", description: "Item description", price: "123.4500", categoryId })
            .expect(200);
        const id: string = created.body.DT.id;
        expect(id).toMatch(/^[1-9]\d*$/);
        const draft = await sequelize.query<{ status: string; basePrice: string }>(
            "SELECT status, base_price AS basePrice FROM products WHERE id = ?",
            { replacements: [id], type: QueryTypes.SELECT },
        );
        expect(draft[0]).toMatchObject({ status: "draft", basePrice: "123.4500" });
        await request(app).get(`/api/v1/product/${id}`).expect(404);
        await request(app).put(`/api/v1/product/update/${id}`).set("Authorization", adminBearer)
            .send({ status: "active", price: "999.0000" }).expect(200);
        const active = await request(app).get(`/api/v1/product/${id}`).expect(200);
        expect(active.body.DT).toMatchObject({ id, basePrice: "999.0000" });
        const events = await sequelize.query<{ eventType: string }>(
            "SELECT event_type AS eventType FROM outbox_events WHERE aggregate_type = 'product' AND aggregate_id = ? ORDER BY id",
            { replacements: [id], type: QueryTypes.SELECT },
        );
        expect(events.map((event) => event.eventType)).toEqual([
            "catalog.product.upserted", "catalog.product.upserted",
        ]);
        await request(app).put(`/api/v1/product/update/${id}`).set("Authorization", adminBearer)
            .send({ categoryId: "9223372036854775807" }).expect(404);
        const afterFailedUpdate = await request(app).get(`/api/v1/product/${id}`).expect(200);
        expect(afterFailedUpdate.body.DT.categoryId).toBe(categoryId);
        await request(app).delete("/api/v1/product/delete").set("Authorization", adminBearer)
            .send({ id }).expect(200);
        await request(app).get(`/api/v1/product/${id}`).expect(404);
        const inactive = await sequelize.query<{ status: string }>("SELECT status FROM products WHERE id = ?", {
            replacements: [id], type: QueryTypes.SELECT,
        });
        expect(inactive[0]?.status).toBe("inactive");
        const finalEvents = await sequelize.query<{ eventType: string }>(
            "SELECT event_type AS eventType FROM outbox_events WHERE aggregate_type = 'product' AND aggregate_id = ? ORDER BY id",
            { replacements: [id], type: QueryTypes.SELECT },
        );
        expect(finalEvents.map((event) => event.eventType)).toEqual([
            "catalog.product.upserted", "catalog.product.upserted", "catalog.product.deleted",
        ]);
    });
});
