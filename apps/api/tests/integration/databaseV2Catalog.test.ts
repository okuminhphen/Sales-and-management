import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const expectedCatalogTables = [
    "categories",
    "products",
    "sizes",
    "product_variants",
    "reviews",
    "banners",
];

describe.skipIf(!runDatabaseV2Tests)(
    "Database V2 catalog migration on MySQL",
    () => {
        let sequelize: Sequelize;

        beforeAll(async () => {
            if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
                throw new Error(
                    "Database V2 integration tests require V2_MIGRATIONS_TARGET_DATABASE ending in _test.",
                );
            }

            await runV2Migrations("up");
            sequelize = new Sequelize(
                env.V2_MIGRATIONS_TARGET_DATABASE,
                env.MYSQL_USER,
                env.MYSQL_PASSWORD,
                {
                    host: env.MYSQL_HOST,
                    port: env.MYSQL_PORT,
                    dialect: "mysql",
                    logging: false,
                },
            );
            await sequelize.authenticate();
        });

        afterAll(async () => {
            await sequelize?.close();
        });

        it("creates catalog tables with product/category FK and product/review checks", async () => {
            const tables = await sequelize.query<{ tableName: string }>(
                `SELECT table_name AS tableName
                 FROM information_schema.tables
                 WHERE table_schema = DATABASE()
                 ORDER BY table_name`,
                { type: QueryTypes.SELECT },
            );
            expect(tables.map((table) => table.tableName)).toEqual(
                expect.arrayContaining(expectedCatalogTables),
            );

            const productForeignKeys = await sequelize
                .getQueryInterface()
                .getForeignKeyReferencesForTable("products");
            expect(productForeignKeys).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        columnName: "category_id",
                        referencedTableName: "categories",
                        referencedColumnName: "id",
                    }),
                ]),
            );

            const productAndReviewChecks = await sequelize.query<{
                tableName: string;
                constraintName: string;
            }>(
                `SELECT table_name AS tableName, constraint_name AS constraintName
                 FROM information_schema.table_constraints
                 WHERE table_schema = DATABASE()
                   AND constraint_type = 'CHECK'
                   AND table_name IN ('products', 'reviews')`,
                { type: QueryTypes.SELECT },
            );
            expect(productAndReviewChecks).toEqual(
                expect.arrayContaining([
                    { tableName: "products", constraintName: "chk_products_base_price" },
                    { tableName: "reviews", constraintName: "chk_reviews_rating" },
                ]),
            );
        });

        it("records the catalog baseline once when the V2 runner is rerun", async () => {
            await runV2Migrations("up");

            const executedMigrations = await sequelize.query<{ name: string }>(
                "SELECT `name` FROM `database_v2_migrations` ORDER BY `name` ASC",
                { type: QueryTypes.SELECT },
            );
            expect(executedMigrations).toEqual([
                { name: "0001-identity-access" },
                { name: "0002-catalog" },
            ]);
        });
    },
);
