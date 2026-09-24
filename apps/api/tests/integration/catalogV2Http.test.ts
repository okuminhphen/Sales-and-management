import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createCatalogV2Router } from "../../src/routes/catalog-v2.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Catalog V2 HTTP on MySQL", () => {
    let sequelize: Sequelize;
    let app: express.Express;
    let categoryId: string;
    let productId: string;
    let inactiveProductId: string;
    let variantId: string;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await sequelize.authenticate();
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
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
});
