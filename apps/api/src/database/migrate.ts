import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Sequelize, type QueryInterface } from "sequelize";
import { SequelizeStorage, Umzug } from "umzug";
import { sequelize } from "../models/index.js";

interface MigrationModule {
    up: (queryInterface: QueryInterface, sequelizeLibrary: typeof Sequelize) => Promise<void>;
    down: (queryInterface: QueryInterface, sequelizeLibrary: typeof Sequelize) => Promise<void>;
}

const currentFile = fileURLToPath(import.meta.url);
const runtimeExtension = path.extname(currentFile);
const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

const migrator = new Umzug<QueryInterface>({
    migrations: {
        glob: path
            .join(migrationsDirectory, `*${runtimeExtension}`)
            .replaceAll("\\", "/"),
        resolve: ({ name, path: migrationPath, context }) => {
            if (!migrationPath) throw new Error(`Migration path missing for ${name}`);
            const storedName = `${path.parse(name).name}.cjs`;
            const load = async (): Promise<MigrationModule> => {
                const loaded = await import(pathToFileURL(migrationPath).href);
                return loaded.default as MigrationModule;
            };
            return {
                name: storedName,
                up: async () => (await load()).up(context, Sequelize),
                down: async () => (await load()).down(context, Sequelize),
            };
        },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
});

const run = async (): Promise<void> => {
    const command = process.argv[2] ?? "up";
    await sequelize.authenticate();
    if (command === "up") await migrator.up();
    else if (command === "down") await migrator.down();
    else if (command === "pending") console.table(await migrator.pending());
    else throw new Error(`Unknown migration command: ${command}`);
};

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => sequelize.close());
