import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CatalogSizeQueryV2Service } from "../../src/modules/catalog/application/catalog-size-query-v2.service.js";
import { SequelizeCatalogSizeV2Repository } from "../../src/modules/catalog/persistence/catalog-size-query-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 public size directory on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST,
            port: env.MYSQL_PORT,
            dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
            logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("serializes BIGINT IDs and orders sizes deterministically", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const firstName = `AAA Test Size ${suffix}`;
        const lastName = `ZZZ Test Size ${suffix}`;
        await sequelize.query(
            "INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [lastName, firstName], type: QueryTypes.INSERT },
        );

        const persistence = createSalesV2Persistence(sequelize);
        const service = new CatalogSizeQueryV2Service({
            repository: new SequelizeCatalogSizeV2Repository(persistence),
        });
        const listed = await service.list({ page: 1, limit: 100 });

        expect(listed).toMatchObject({
            kind: "sizes",
            page: {
                limit: 100,
                sizes: expect.arrayContaining([
                    expect.objectContaining({ id: expect.any(String), name: firstName }),
                    expect.objectContaining({ id: expect.any(String), name: lastName }),
                ]),
            },
        });
        if (listed.kind !== "sizes") return;
        const firstIndex = listed.page.sizes.findIndex((size) => size.name === firstName);
        const lastIndex = listed.page.sizes.findIndex((size) => size.name === lastName);
        expect(firstIndex).toBeGreaterThanOrEqual(0);
        expect(lastIndex).toBeGreaterThan(firstIndex);
    });
});
