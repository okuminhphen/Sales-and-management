import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CatalogProductQueryV2Service } from "../../src/modules/catalog/application/catalog-product-query-v2.service.js";
import { SequelizeCatalogProductV2Repository } from "../../src/modules/catalog/persistence/catalog-product-query-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 public product directory on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST,
            port: env.MYSQL_PORT,
            dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
            logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("hides inactive data while preserving money and sanitizing image JSON", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const categoryCode = `CAT_PRODUCT_${suffix}`;
        const categorySlug = `cat-product-${suffix}`;
        const activeSlug = `active-product-${suffix}`;
        const inactiveSlug = `inactive-product-${suffix}`;
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, ?, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [categoryCode, "Product test category", categorySlug], type: QueryTypes.INSERT },
        );
        const categories = await sequelize.query<{ id: string }>(
            "SELECT id FROM categories WHERE code = ?",
            { replacements: [categoryCode], type: QueryTypes.SELECT },
        );
        const categoryId = categories[0]!.id;
        await sequelize.query(
            "INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, JSON_ARRAY(JSON_OBJECT('url', ?), JSON_OBJECT('url', ?), JSON_OBJECT('url', ?)), 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            {
                replacements: [
                    categoryId,
                    "Active test product",
                    activeSlug,
                    "Public description",
                    "1299000.0000",
                    "https://res.cloudinary.com/demo/image/upload/product.jpg",
                    "javascript:alert(1)",
                    "not a url",
                ],
                type: QueryTypes.INSERT,
            },
        );
        await sequelize.query(
            "INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, 'inactive', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            {
                replacements: [categoryId, "Inactive test product", inactiveSlug, "1000.0000"],
                type: QueryTypes.INSERT,
            },
        );
        const productIds = await sequelize.query<{ id: string; slug: string }>(
            "SELECT id, slug FROM products WHERE slug IN (?, ?)",
            { replacements: [activeSlug, inactiveSlug], type: QueryTypes.SELECT },
        );
        const activeId = productIds.find((product) => product.slug === activeSlug)!.id;
        const inactiveId = productIds.find((product) => product.slug === inactiveSlug)!.id;

        const persistence = createSalesV2Persistence(sequelize);
        const service = new CatalogProductQueryV2Service({
            repository: new SequelizeCatalogProductV2Repository(persistence),
        });
        const active = await service.getById(activeId);
        await expect(service.getById(inactiveId)).resolves.toEqual({ kind: "product_not_found" });
        const listed = await service.list({ page: 1, limit: 100 });

        expect(active).toEqual({
            kind: "product",
            product: expect.objectContaining({
                id: activeId,
                categoryId,
                slug: activeSlug,
                basePrice: "1299000.0000",
                images: [{ url: "https://res.cloudinary.com/demo/image/upload/product.jpg" }],
            }),
        });
        expect(listed).toMatchObject({
            kind: "products",
            page: {
                products: expect.arrayContaining([expect.objectContaining({ id: activeId })]),
            },
        });
        if (listed.kind !== "products") return;
        expect(listed.page.products.some((product) => product.id === inactiveId)).toBe(false);
    });
});
