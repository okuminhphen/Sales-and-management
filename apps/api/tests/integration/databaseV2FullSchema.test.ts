import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

type SchemaManifest = {
    tableCount: number;
    referenceCount: number;
    tableNames: string[];
};

const manifestFile = fileURLToPath(
    new URL("../../../../docs/database-v2/schema-manifest.json", import.meta.url),
);
const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as SchemaManifest;
const migrationNames = [
    "0001-identity-access",
    "0002-catalog",
    "0003-commerce",
    "0004-fulfillment",
    "0005-inventory",
    "0006-communication",
];
const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 full schema on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(
            env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD,
            { host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false },
        );
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("has exactly 49 approved business tables plus separate migration metadata", async () => {
        const tables = await sequelize.query<{ tableName: string }>(
            "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
            { type: QueryTypes.SELECT },
        );
        const actual = tables.map((row) => row.tableName);
        expect(actual).toHaveLength(manifest.tableCount + 1);
        expect(actual).toEqual([...manifest.tableNames, "database_v2_migrations"].sort());
    });

    it("has 104 foreign keys across the approved schema", async () => {
        const foreignKeys = await sequelize.query<{ constraintName: string }>(
            "SELECT constraint_name AS constraintName FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'",
            { type: QueryTypes.SELECT },
        );
        expect(foreignKeys).toHaveLength(manifest.referenceCount);
    });

    it("records all six migrations once and has zero pending on rerun", async () => {
        await runV2Migrations("up");
        const executed = await sequelize.query<{ name: string }>(
            "SELECT name FROM database_v2_migrations ORDER BY name",
            { type: QueryTypes.SELECT },
        );
        expect(executed.map((row) => row.name)).toEqual(migrationNames);
        await runV2Migrations("up");
        const count = await sequelize.query<{ total: number }>(
            "SELECT COUNT(*) AS total FROM database_v2_migrations",
            { type: QueryTypes.SELECT },
        );
        expect(count[0]?.total).toBe(migrationNames.length);
    });
});
