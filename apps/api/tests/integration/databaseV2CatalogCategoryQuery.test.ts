import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CatalogCategoryQueryV2Service } from "../../src/modules/catalog/application/catalog-category-query-v2.service.js";
import { SequelizeCatalogCategoryV2Repository } from "../../src/modules/catalog/persistence/catalog-category-query-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 public category directory on MySQL", () => {
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

    it("returns parent and child category IDs as strings through a bounded ordered directory", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
        const parentCode = `CAT_PARENT_${suffix}`;
        const childCode = `CAT_CHILD_${suffix}`;
        const parentSlug = `cat-parent-${suffix.toLowerCase()}`;
        const childSlug = `cat-child-${suffix.toLowerCase()}`;
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, ?, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [parentCode, "Parent category", parentSlug], type: QueryTypes.INSERT },
        );
        const parentRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM categories WHERE code = ?",
            { replacements: [parentCode], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [parentRows[0]!.id, childCode, "Child category", childSlug, "Nested category"], type: QueryTypes.INSERT },
        );

        const persistence = createSalesV2Persistence(sequelize);
        const service = new CatalogCategoryQueryV2Service({
            repository: new SequelizeCatalogCategoryV2Repository(persistence),
        });
        const allCategories = [];
        for (let page = 1; ; page += 1) {
            const listed = await service.list({ page, limit: 100 });
            expect(listed.kind).toBe("categories");
            if (listed.kind !== "categories") return;
            allCategories.push(...listed.page.categories);
            if (page >= listed.page.totalPages) break;
        }
        expect(allCategories).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: parentRows[0]!.id, code: parentCode, parentId: null }),
            expect.objectContaining({ code: childCode, parentId: parentRows[0]!.id }),
        ]));
        expect(allCategories.map((category) => category.code)).toEqual(
            [...allCategories.map((category) => category.code)].sort((left, right) => left.localeCompare(right)),
        );
    });
});
