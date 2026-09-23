import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CatalogProductVariantQueryV2Service } from "../../src/modules/catalog/application/catalog-product-variant-query-v2.service.js";
import { SequelizeCatalogProductVariantV2Repository } from "../../src/modules/catalog/persistence/catalog-product-variant-query-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 public product variants on MySQL", () => {
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

    it("returns active variants for an active product without exposing SKU or stock", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const categoryCode = `CAT_VARIANT_${suffix}`;
        const categorySlug = `cat-variant-${suffix}`;
        const productSlug = `variant-product-${suffix}`;
        const firstSizeName = `AAA ${suffix}`;
        const inactiveSizeName = `ZZZ ${suffix}`;
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, ?, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [categoryCode, "Variant test category", categorySlug], type: QueryTypes.INSERT },
        );
        const categories = await sequelize.query<{ id: string }>(
            "SELECT id FROM categories WHERE code = ?",
            { replacements: [categoryCode], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            "INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [categories[0]!.id, "Variant test product", productSlug, "1000.0000"], type: QueryTypes.INSERT },
        );
        const products = await sequelize.query<{ id: string }>(
            "SELECT id FROM products WHERE slug = ?",
            { replacements: [productSlug], type: QueryTypes.SELECT },
        );
        const productId = products[0]!.id;
        await sequelize.query(
            "INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [firstSizeName, inactiveSizeName], type: QueryTypes.INSERT },
        );
        const sizes = await sequelize.query<{ id: string; name: string }>(
            "SELECT id, name FROM sizes WHERE name IN (?, ?)",
            { replacements: [firstSizeName, inactiveSizeName], type: QueryTypes.SELECT },
        );
        const activeSizeId = sizes.find((size) => size.name === firstSizeName)!.id;
        const inactiveSizeId = sizes.find((size) => size.name === inactiveSizeName)!.id;
        await sequelize.query(
            "INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, ?, 'inactive', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            {
                replacements: [
                    productId, activeSizeId, `ACTIVE-${suffix}`,
                    productId, inactiveSizeId, `INACTIVE-${suffix}`,
                ],
                type: QueryTypes.INSERT,
            },
        );

        const persistence = createSalesV2Persistence(sequelize);
        const service = new CatalogProductVariantQueryV2Service({
            repository: new SequelizeCatalogProductVariantV2Repository(persistence),
        });
        const listed = await service.listByProductId(productId);

        expect(listed).toEqual({
            kind: "product_variants",
            variants: [expect.objectContaining({ productId, sizeId: activeSizeId, sizeName: firstSizeName })],
        });
        if (listed.kind !== "product_variants") return;
        expect(listed.variants[0]).not.toHaveProperty("sku");
        expect(listed.variants[0]).not.toHaveProperty("stock");
    });
});
