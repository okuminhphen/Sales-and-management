import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const expectedTables = [
    "accounts",
    "roles",
    "permissions",
    "role_permissions",
    "account_roles",
    "customers",
    "customer_addresses",
    "branches",
    "employees",
    "database_v2_migrations",
];

describe.skipIf(!runDatabaseV2Tests)(
    "Database V2 identity/access migration on MySQL",
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

        it("creates the expected tables, cyclic branch-manager FK, and supporting indexes", async () => {
            const tables = await sequelize.query<{ tableName: string }>(
                `SELECT table_name AS tableName
                 FROM information_schema.tables
                 WHERE table_schema = DATABASE()
                 ORDER BY table_name`,
                { type: QueryTypes.SELECT },
            );

            expect(tables.map((table) => table.tableName)).toEqual(
                expect.arrayContaining(expectedTables),
            );

            const foreignKeys = await sequelize
                .getQueryInterface()
                .getForeignKeyReferencesForTable("branches");
            expect(foreignKeys).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        columnName: "manager_employee_id",
                        referencedTableName: "employees",
                        referencedColumnName: "id",
                    }),
                ]),
            );

            const accountRoleIndexes = (await sequelize
                .getQueryInterface()
                .showIndex("account_roles")) as Array<{ name: string }>;
            expect(accountRoleIndexes.map((index) => index.name)).toEqual(
                expect.arrayContaining([
                    "uq_account_roles_account_role_scope",
                    "idx_account_roles_branch_role",
                ]),
            );

            const accountRoleConstraints = await sequelize.query<{
                constraintName: string;
                constraintType: string;
            }>(
                `SELECT constraint_name AS constraintName, constraint_type AS constraintType
                 FROM information_schema.table_constraints
                 WHERE table_schema = DATABASE() AND table_name = 'account_roles'`,
                { type: QueryTypes.SELECT },
            );
            expect(accountRoleConstraints).toEqual(
                expect.arrayContaining([
                    {
                        constraintName: "chk_account_role_scope",
                        constraintType: "CHECK",
                    },
                ]),
            );
        });

        it("records the identity baseline exactly once when the V2 runner is rerun", async () => {
            await runV2Migrations("up");

            const executedMigrations = await sequelize.query<{ name: string }>(
                "SELECT `name` FROM `database_v2_migrations` ORDER BY `name` ASC",
                { type: QueryTypes.SELECT },
            );
            expect(
                executedMigrations.filter(
                    (migration) => migration.name === "0001-identity-access",
                ),
            ).toEqual([{ name: "0001-identity-access" }]);
        });
    },
);
