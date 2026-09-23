import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    DataTypes,
    QueryTypes,
    Sequelize,
    type QueryInterface,
} from "sequelize";
import {
    Umzug,
    type MigrationParams,
    type UmzugStorage,
} from "umzug";
import { env } from "../../config/env.js";
import {
    APPROVED_V2_SCHEMA_FILE,
    assertV2MigrationTarget,
    type V2MigrationTarget,
} from "./target-guard.js";

const V2_MIGRATION_METADATA_TABLE = "database_v2_migrations";
const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const runtimeExtension = path.extname(currentFile);
const migrationsDirectory = path.join(
    path.dirname(currentFile),
    "migrations",
);

type SchemaManifest = {
    schemaFile: string;
    sha256: string;
};

type V2MigrationModule = {
    up: (
        queryInterface: QueryInterface,
        sequelizeLibrary: typeof Sequelize,
    ) => Promise<void>;
    down?: (
        queryInterface: QueryInterface,
        sequelizeLibrary: typeof Sequelize,
    ) => Promise<void>;
};

type ExecutedMigrationRow = {
    name: string;
};

const readSchemaManifest = (): SchemaManifest => {
    const manifestPath = path.join(
        repositoryRoot,
        "docs/database-v2/schema-manifest.json",
    );
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));

    if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as SchemaManifest).schemaFile !== "string" ||
        typeof (parsed as SchemaManifest).sha256 !== "string"
    ) {
        throw new Error("Database V2 schema manifest is invalid.");
    }

    return parsed as SchemaManifest;
};

const loadV2MigrationTarget = (): V2MigrationTarget => {
    const manifest = readSchemaManifest();
    const schemaSource = readFileSync(
        path.join(repositoryRoot, APPROVED_V2_SCHEMA_FILE),
        "utf8",
    );

    return {
        enabled: env.V2_MIGRATIONS_ENABLED,
        nodeEnvironment: env.NODE_ENV,
        targetDatabase: env.V2_MIGRATIONS_TARGET_DATABASE,
        schemaFile: manifest.schemaFile,
        schemaSource,
        expectedChecksum: manifest.sha256,
    };
};

const assertV2MigrationMetadata = async (
    queryInterface: QueryInterface,
): Promise<void> => {
    const tableExists = await queryInterface.tableExists(
        V2_MIGRATION_METADATA_TABLE,
    );

    if (!tableExists) {
        await queryInterface.createTable(
            V2_MIGRATION_METADATA_TABLE,
            {
                name: {
                    type: DataTypes.STRING(191),
                    allowNull: false,
                    primaryKey: true,
                },
                executed_at: {
                    type: DataTypes.DATE(3),
                    allowNull: false,
                },
            },
            {
                engine: "InnoDB",
                charset: "utf8mb4",
                collate: "utf8mb4_unicode_ci",
            },
        );
    }

    const columns = await queryInterface.describeTable(
        V2_MIGRATION_METADATA_TABLE,
    );
    const nameColumn = columns.name;
    const executedAtColumn = columns.executed_at;

    if (
        !nameColumn ||
        !nameColumn.primaryKey ||
        !executedAtColumn ||
        executedAtColumn.allowNull
    ) {
        throw new Error(
            "Database V2 migration metadata has an unexpected table structure.",
        );
    }
};

class DatabaseV2MigrationStorage implements UmzugStorage<QueryInterface> {
    public constructor(private readonly sequelize: Sequelize) {}

    public async executed(): Promise<string[]> {
        const rows = await this.sequelize.query<ExecutedMigrationRow>(
            `SELECT \`name\` FROM \`${V2_MIGRATION_METADATA_TABLE}\` ORDER BY \`name\` ASC`,
            { type: QueryTypes.SELECT },
        );

        return rows.map((row) => row.name);
    }

    public async logMigration({ name }: MigrationParams<QueryInterface>): Promise<void> {
        await this.sequelize.query(
            `INSERT INTO \`${V2_MIGRATION_METADATA_TABLE}\` (\`name\`, \`executed_at\`) VALUES (?, UTC_TIMESTAMP(3))`,
            { replacements: [name], type: QueryTypes.INSERT },
        );
    }

    public async unlogMigration({ name }: MigrationParams<QueryInterface>): Promise<void> {
        await this.sequelize.query(
            `DELETE FROM \`${V2_MIGRATION_METADATA_TABLE}\` WHERE \`name\` = ?`,
            { replacements: [name], type: QueryTypes.DELETE },
        );
    }
}

const loadMigrations = () => {
    if (!runtimeExtension || !existsSync(migrationsDirectory)) return [];

    const migrationFileNames = readdirSync(migrationsDirectory, {
        withFileTypes: true,
    })
        .filter(
            (entry) =>
                entry.isFile() && path.extname(entry.name) === runtimeExtension,
        )
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));

    return migrationFileNames.map((fileName) => {
        const migrationPath = path.join(migrationsDirectory, fileName);
        const load = async (): Promise<V2MigrationModule> => {
            const loaded = await import(pathToFileURL(migrationPath).href);
            return loaded.default as V2MigrationModule;
        };

        return {
            name: path.parse(fileName).name,
            path: migrationPath,
            up: async ({ context }: { context: QueryInterface }) =>
                (await load()).up(context, Sequelize),
            down: async ({ context }: { context: QueryInterface }) => {
                const migration = await load();
                if (!migration.down) {
                    throw new Error(`Database V2 migration ${fileName} has no down handler.`);
                }
                await migration.down(context, Sequelize);
            },
        };
    });
};

const createV2Sequelize = (targetDatabase: string): Sequelize =>
    new Sequelize(targetDatabase, env.MYSQL_USER, env.MYSQL_PASSWORD, {
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        dialect: "mysql",
        logging: false,
    });

export const runV2Migrations = async (
    command: "status" | "up",
): Promise<void> => {
    const target = loadV2MigrationTarget();
    assertV2MigrationTarget(target);

    const sequelize = createV2Sequelize(target.targetDatabase!.trim());
    const queryInterface = sequelize.getQueryInterface();
    const migrator = new Umzug<QueryInterface>({
        migrations: loadMigrations(),
        context: queryInterface,
        storage: new DatabaseV2MigrationStorage(sequelize),
        logger: undefined,
    });

    try {
        await sequelize.authenticate();
        await assertV2MigrationMetadata(queryInterface);

        if (command === "up") {
            await migrator.up();
            return;
        }

        const [executed, pending] = await Promise.all([
            migrator.executed(),
            migrator.pending(),
        ]);
        console.table({
            executed: executed.map((migration) => migration.name),
            pending: pending.map((migration) => migration.name),
        });
    } finally {
        await sequelize.close();
    }
};

const runFromCli = async (): Promise<void> => {
    const command = process.argv[2] ?? "status";
    if (command !== "status" && command !== "up") {
        throw new Error("Database V2 migration command must be either status or up.");
    }

    await runV2Migrations(command);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
    runFromCli().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
