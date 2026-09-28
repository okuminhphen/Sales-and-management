import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../config/env.js";
import { createSalesV2Persistence } from "./models.js";
import type { V2Persistence } from "./persistence.js";

export const createV2RuntimeSequelize = (): Sequelize => new Sequelize({
    database: env.MYSQL_DATABASE,
    username: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    dialect: "mysql",
    timezone: "+07:00",
    logging: false,
    pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
});

export const createV2RuntimePersistence = (): V2Persistence =>
    createSalesV2Persistence(createV2RuntimeSequelize());

type MigrationCountRow = { migrationCount: unknown };
type TableRow = { tableName: unknown };
const EXPECTED_V2_MIGRATION_COUNT = 6;

/** Refuses to serve traffic when the configured database is not the complete V2 baseline. */
export const assertV2RuntimeReady = async (persistence: V2Persistence): Promise<void> => {
    const migrationRows = await persistence.sequelize.query<MigrationCountRow>(
        "SELECT COUNT(*) AS migrationCount FROM database_v2_migrations",
        { type: QueryTypes.SELECT },
    );
    if (Number(migrationRows[0]?.migrationCount) !== EXPECTED_V2_MIGRATION_COUNT) {
        throw new Error("Database V2 runtime gate rejected an incomplete migration baseline.");
    }
    const tableRows = await persistence.sequelize.query<TableRow>(
        `SELECT table_name AS tableName FROM information_schema.tables
         WHERE table_schema = DATABASE()`,
        { type: QueryTypes.SELECT },
    );
    const actual = new Set(tableRows.map((row) => String(row.tableName)));
    const expected = persistence.models.names().map((name) => {
        const tableName = persistence.models.get(name).getTableName();
        return typeof tableName === "string" ? tableName : tableName.tableName;
    });
    if (actual.size !== expected.length + 1 || !actual.has("database_v2_migrations")
        || expected.some((tableName) => !actual.has(tableName))) {
        throw new Error("Database V2 runtime gate rejected an unexpected table set.");
    }
};
