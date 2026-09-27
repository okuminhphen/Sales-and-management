import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sequelize } from "sequelize";
import { env } from "../../config/env.js";
import {
    LOCAL_V2_CUTOVER_DATABASE,
    assertApprovedLocalV2CutoverTarget,
} from "./target-guard.js";
import { runApprovedLocalV2CutoverMigrations } from "./migrate.js";
import { seedV2Database, validateV2SuperAdminCredentials } from "./seed.js";

type SchemaManifest = { schemaFile: string; sha256: string };
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const loadApprovedSchema = (): { schemaFile: string; schemaSource: string; expectedChecksum: string } => {
    const manifest = JSON.parse(
        readFileSync(path.join(repositoryRoot, "docs/database-v2/schema-manifest.json"), "utf8"),
    ) as SchemaManifest;
    return {
        schemaFile: manifest.schemaFile,
        schemaSource: readFileSync(path.join(repositoryRoot, manifest.schemaFile), "utf8"),
        expectedChecksum: manifest.sha256,
    };
};

const createServerConnection = (): Sequelize => new Sequelize({
    dialect: "mysql",
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    username: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    logging: false,
});

const createTargetConnection = (): Sequelize => new Sequelize(
    LOCAL_V2_CUTOVER_DATABASE,
    env.MYSQL_USER,
    env.MYSQL_PASSWORD,
    { host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false },
);

export const runApprovedLocalV2Cutover = async (): Promise<void> => {
    const schema = loadApprovedSchema();
    const credentials = validateV2SuperAdminCredentials({
        email: env.SUPER_ADMIN_EMAIL ?? "",
        password: env.SUPER_ADMIN_PASSWORD ?? "",
    });
    assertApprovedLocalV2CutoverTarget({
        enabled: env.V2_MIGRATIONS_ENABLED,
        nodeEnvironment: env.NODE_ENV,
        targetDatabase: env.V2_MIGRATIONS_TARGET_DATABASE,
        configuredDatabase: env.MYSQL_DATABASE,
        confirmation: env.V2_LOCAL_CUTOVER_CONFIRM,
        ...schema,
    });

    const server = createServerConnection();
    try {
        await server.authenticate();
        await server.query(`DROP DATABASE IF EXISTS \`${LOCAL_V2_CUTOVER_DATABASE}\``);
        await server.query(
            `CREATE DATABASE \`${LOCAL_V2_CUTOVER_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
    } finally {
        await server.close();
    }

    await runApprovedLocalV2CutoverMigrations("up");
    const target = createTargetConnection();
    try {
        await target.authenticate();
        await seedV2Database(target, credentials);
    } finally {
        await target.close();
    }
};

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === currentFile) {
    runApprovedLocalV2Cutover().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
