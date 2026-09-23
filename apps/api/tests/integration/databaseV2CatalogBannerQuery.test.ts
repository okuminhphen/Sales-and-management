import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CatalogBannerQueryV2Service } from "../../src/modules/catalog/application/catalog-banner-query-v2.service.js";
import { SequelizeCatalogBannerV2Repository } from "../../src/modules/catalog/persistence/catalog-banner-query-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 public banner directory on MySQL", () => {
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

    it("returns only active banners and normalizes legacy-compatible JSON media", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const activeName = `Active banner ${suffix}`;
        const inactiveName = `Inactive banner ${suffix}`;
        await sequelize.query(
            "INSERT INTO banners (name, image, target_url, status, created_at, updated_at) VALUES (?, JSON_OBJECT('url', ?), ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, JSON_OBJECT('url', ?), ?, 'inactive', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            {
                replacements: [
                    activeName,
                    "https://res.cloudinary.com/demo/image/upload/banner.jpg",
                    "/products",
                    inactiveName,
                    "javascript:alert(1)",
                    "//invalid.example.com",
                ],
                type: QueryTypes.INSERT,
            },
        );

        const persistence = createSalesV2Persistence(sequelize);
        const service = new CatalogBannerQueryV2Service({
            repository: new SequelizeCatalogBannerV2Repository(persistence),
        });
        const listed = await service.list({ page: 1, limit: 100 });

        expect(listed).toMatchObject({
            kind: "banners",
            page: {
                banners: expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        name: activeName,
                        image: { url: "https://res.cloudinary.com/demo/image/upload/banner.jpg" },
                        targetUrl: "/products",
                    }),
                ]),
            },
        });
        if (listed.kind !== "banners") return;
        expect(listed.page.banners.some((banner) => banner.name === inactiveName)).toBe(false);
    });
});
