import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertV2RuntimeReady, createV2RuntimePersistence } from "../../src/database/v2/runtime.js";
import type { V2Persistence } from "../../src/database/v2/persistence.js";

const manifest = JSON.parse(readFileSync(
    new URL("../../../../docs/database-v2/migration-manifest.json", import.meta.url), "utf8",
)) as { migrations: Record<string, string> };
const approvedMigrations = Object.entries(manifest.migrations).map(([name, checksum]) => ({ name, checksum }));
const opened: V2Persistence[] = [];

const createPersistence = (): V2Persistence => {
    const persistence = createV2RuntimePersistence();
    opened.push(persistence);
    return persistence;
};

const completeTables = (persistence: V2Persistence): Array<{ tableName: string }> => [
    ...persistence.models.names().map((name) => {
        const tableName = persistence.models.get(name).getTableName();
        return { tableName: typeof tableName === "string" ? tableName : tableName.tableName };
    }),
    { tableName: "database_v2_migrations" },
];

const stubSchema = (
    persistence: V2Persistence,
    migrations: Array<{ name: string; checksum: string }>,
    tables = completeTables(persistence),
): void => {
    vi.spyOn(persistence.sequelize, "query").mockImplementation(async (sql) => {
        if (String(sql).includes("database_v2_migrations")) {
            // Model both old count-only queries and the new exact-inventory query.
            return (/COUNT\(/i.test(String(sql)) ? [{ migrationCount: migrations.length }] : migrations) as never;
        }
        return tables as never;
    });
};

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(opened.splice(0).map((persistence) => persistence.sequelize.close()));
});

describe("Database V2 runtime persistence", () => {
    it("creates one closed registry containing all V2 models", () => {
        const persistence = createPersistence();

        expect(persistence.models.names()).toHaveLength(49);
        expect(persistence.models.names()).toContain("Account");
        expect(persistence.models.names()).toContain("OutboxEvent");
    });

    it("uses UTC so raw UTC_TIMESTAMP writes and ORM Date writes share one clock", () => {
        const persistence = createPersistence();

        expect(persistence.sequelize).toHaveProperty("options.timezone", "+00:00");
    });

    it("accepts only the complete V2 migration and table baseline", async () => {
        const persistence = createPersistence();
        stubSchema(persistence, approvedMigrations);

        await expect(assertV2RuntimeReady(persistence)).resolves.toBeUndefined();
    });

    it.each([
        ["missing migration", approvedMigrations.slice(1)],
        ["tampered checksum", approvedMigrations.map((row, index) => index === 0
            ? { ...row, checksum: "0".repeat(64) } : row)],
        ["unknown migration replacing an approved one", approvedMigrations.map((row, index) => index === 0
            ? { ...row, name: "0007-unapproved" } : row)],
        ["duplicate replacing a required migration", [approvedMigrations[0], ...approvedMigrations.slice(0, -1)]],
        ["extra migration", [...approvedMigrations, { name: "0007-unapproved", checksum: "0".repeat(64) }]],
    ])("fails closed for %s even when tables are complete", async (_reason, migrations) => {
        const persistence = createPersistence();
        stubSchema(persistence, migrations);

        await expect(assertV2RuntimeReady(persistence)).rejects.toThrow(/migration/i);
    });

    it.each(["missing", "replaced", "extra"] as const)("rejects a %s table despite valid migration checksums", async (change) => {
        const persistence = createPersistence();
        const tables = completeTables(persistence);
        if (change === "missing") tables.shift();
        if (change === "replaced") tables[0] = { tableName: "unexpected_table" };
        if (change === "extra") tables.push({ tableName: "unexpected_table" });
        stubSchema(persistence, approvedMigrations, tables);

        await expect(assertV2RuntimeReady(persistence)).rejects.toThrow(/table/i);
    });
});
