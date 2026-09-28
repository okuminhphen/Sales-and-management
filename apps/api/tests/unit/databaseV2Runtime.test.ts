import { describe, expect, it, vi } from "vitest";
import { assertV2RuntimeReady, createV2RuntimePersistence } from "../../src/database/v2/runtime.js";

describe("Database V2 runtime persistence", () => {
    it("creates one closed registry containing all V2 models", () => {
        const persistence = createV2RuntimePersistence();

        expect(persistence.models.names()).toHaveLength(49);
        expect(persistence.models.names()).toContain("Account");
        expect(persistence.models.names()).toContain("OutboxEvent");
    });

    it("accepts only the complete V2 migration and table baseline", async () => {
        const persistence = createV2RuntimePersistence();
        const tables = persistence.models.names().map((name) => {
            const tableName = persistence.models.get(name).getTableName();
            return { tableName: typeof tableName === "string" ? tableName : tableName.tableName };
        });
        vi.spyOn(persistence.sequelize, "query")
            .mockResolvedValueOnce([{ migrationCount: 6 }] as never)
            .mockResolvedValueOnce([...tables, { tableName: "database_v2_migrations" }] as never);

        await expect(assertV2RuntimeReady(persistence)).resolves.toBeUndefined();
        await persistence.sequelize.close();
    });

    it("fails closed when the configured database is not the V2 baseline", async () => {
        const persistence = createV2RuntimePersistence();
        vi.spyOn(persistence.sequelize, "query").mockResolvedValueOnce([{ migrationCount: 5 }] as never);

        await expect(assertV2RuntimeReady(persistence)).rejects.toThrow("incomplete migration baseline");
        await persistence.sequelize.close();
    });
});
