import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize, type Model, type ModelStatic } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

type ForeignKeyRow = { tableName: string; columnName: string };

const dataTypeKey = (dataType: unknown): string => {
    if (typeof dataType === "object" && dataType && "key" in dataType) {
        return String(dataType.key);
    }
    return String(dataType).toUpperCase();
};

const modelTypeMatchesColumn = (modelType: string, columnType: string): boolean => {
    const actual = columnType.toUpperCase();
    if (modelType === "DATE") return actual.startsWith("TIMESTAMP") || actual.startsWith("DATETIME");
    if (modelType === "BOOLEAN") return actual.startsWith("TINYINT");
    if (modelType === "INTEGER") return actual.startsWith("INT");
    if (modelType === "STRING") return actual.startsWith("VARCHAR");
    return actual.startsWith(modelType);
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 full typed persistence on MySQL", () => {
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

    it("maps all 49 tables with matching columns, logical types and nullability", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        expect(persistence.models.names()).toHaveLength(49);

        for (const name of persistence.models.names()) {
            const model = persistence.models.get(name);
            const tableName = model.getTableName() as string;
            const table = await sequelize.getQueryInterface().describeTable(tableName);
            await model.findAll({ limit: 1 });

            for (const [attributeName, attribute] of Object.entries(model.getAttributes())) {
                const columnName = attribute.field ?? attributeName;
                const column = table[columnName];
                const modelType = dataTypeKey(attribute.type);
                expect(column, `${name}.${columnName} must exist`).toBeDefined();
                expect(column.allowNull, `${name}.${columnName} nullability`).toBe(attribute.allowNull);
                expect(
                    modelTypeMatchesColumn(modelType, column.type),
                    `${name}.${columnName} type ${column.type} must map ${modelType}`,
                ).toBe(true);
            }
        }
    });

    it("represents every MySQL foreign key with a source-model belongsTo association", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const foreignKeys = await sequelize.query<ForeignKeyRow>(`
            SELECT kcu.TABLE_NAME AS tableName, kcu.COLUMN_NAME AS columnName
            FROM information_schema.KEY_COLUMN_USAGE kcu
            WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
              AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
        `, { type: QueryTypes.SELECT });
        expect(foreignKeys).toHaveLength(104);

        const modelsByTable = new Map<string, ModelStatic<Model>>(
            persistence.models.names().map((name) => {
                const model = persistence.models.get(name);
                return [model.getTableName() as string, model];
            }),
        );

        for (const foreignKey of foreignKeys) {
            const model = modelsByTable.get(foreignKey.tableName);
            expect(model, `model for ${foreignKey.tableName}`).toBeDefined();
            const matchingAttributes = Object.entries(model!.getAttributes())
                .filter(([attributeName, attribute]) => (attribute.field ?? attributeName) === foreignKey.columnName)
                .map(([attributeName]) => attributeName);
            const associations = Object.values(model!.associations);
            expect(
                associations.some((association) => matchingAttributes.includes(association.foreignKey)),
                `${foreignKey.tableName}.${foreignKey.columnName} needs a belongsTo association`,
            ).toBe(true);
        }
    });
});
