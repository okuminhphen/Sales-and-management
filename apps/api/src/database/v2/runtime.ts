import { readFileSync } from "node:fs";
import { QueryTypes, type Sequelize } from "sequelize";
import { env } from "../../config/env.js";
import { createV2Sequelize } from "./connection.js";
import { assertExecutedMigrationChecksums, parseApprovedMigrationChecksums } from "./migration-integrity.js";
import { createSalesV2Persistence } from "./models.js";
import type { V2Persistence } from "./persistence.js";

export const createV2RuntimeSequelize = (): Sequelize => createV2Sequelize(env.MYSQL_DATABASE, env);

export const createV2RuntimePersistence = (): V2Persistence =>
    createSalesV2Persistence(createV2RuntimeSequelize());

type ExecutedMigrationRow = { name: string; checksum: string };
type TableRow = { tableName: unknown };

const loadApprovedChecksums = (): ReadonlyMap<string, string> => {
    // Same resource path in source, compiled dist and the API runtime image.
    const root = new URL("../../../../../docs/database-v2/", import.meta.url);
    const schema: unknown = JSON.parse(readFileSync(new URL("schema-manifest.json", root), "utf8"));
    if (!schema || typeof schema !== "object" || !("schemaRevision" in schema)
        || typeof schema.schemaRevision !== "number" || !Number.isInteger(schema.schemaRevision)) {
        throw new Error("Database V2 schema manifest is invalid.");
    }
    const manifest: unknown = JSON.parse(readFileSync(new URL("migration-manifest.json", root), "utf8"));
    return parseApprovedMigrationChecksums(manifest, schema.schemaRevision);
};

/** Refuses to serve traffic when the configured database is not the complete V2 baseline. */
export const assertV2RuntimeReady = async (persistence: V2Persistence): Promise<void> => {
    const approved = loadApprovedChecksums();
    const migrationRows = await persistence.sequelize.query<ExecutedMigrationRow>(
        "SELECT name, checksum FROM database_v2_migrations ORDER BY name",
        { type: QueryTypes.SELECT },
    );
    if (migrationRows.length !== approved.size || new Set(migrationRows.map((row) => row.name)).size !== approved.size) {
        throw new Error("Database V2 runtime gate rejected an incomplete migration baseline.");
    }
    assertExecutedMigrationChecksums(migrationRows, approved);
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
