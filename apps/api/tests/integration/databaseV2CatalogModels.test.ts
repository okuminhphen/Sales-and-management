import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createV2ModelRegistry } from "../../src/database/v2/persistence.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createCatalogPersistenceModule } from "../../src/modules/catalog/persistence/catalog.models.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

const expectedColumns = {
    Category: ["id", "parent_id", "code", "name", "slug", "description", "created_at", "updated_at"],
    Product: ["id", "category_id", "name", "slug", "description", "base_price", "images", "status", "created_at", "updated_at"],
    Size: ["id", "name", "created_at", "updated_at"],
    ProductVariant: ["id", "product_id", "size_id", "sku", "status", "created_at", "updated_at"],
    Review: ["id", "customer_id", "product_id", "order_item_id", "rating", "review_text", "created_at", "updated_at"],
    Banner: ["id", "name", "image", "target_url", "status", "created_at", "updated_at"],
} as const;

describe.skipIf(!runDatabaseV2Tests)("Database V2 catalog typed models on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => sequelize?.close());

    it("maps each catalog model to its complete V2 table and composes internal associations", async () => {
        const module = createCatalogPersistenceModule(sequelize);
        expect(() => createV2ModelRegistry([module])).not.toThrow();
        expect(module.models.map(({ name }) => name).sort()).toEqual(Object.keys(expectedColumns).sort());

        for (const { name, model } of module.models) {
            const tableName = model.getTableName() as string;
            const fields = Object.entries(model.getAttributes())
                .map(([attributeName, attribute]) => attribute.field ?? attributeName)
                .sort();
            const table = await sequelize.getQueryInterface().describeTable(tableName);
            expect(fields).toEqual([...expectedColumns[name as keyof typeof expectedColumns]].sort());
            expect(Object.keys(table).sort()).toEqual(fields);
        }
    });
});
