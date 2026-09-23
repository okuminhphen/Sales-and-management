import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { CatalogBannerCommandV2Service } from "../../src/modules/catalog/application/catalog-banner-command-v2.service.js";
import { SequelizeCatalogBannerCommandV2Repository } from "../../src/modules/catalog/persistence/catalog-banner-command-v2.repository.js";
import { CatalogBannerQueryV2Service } from "../../src/modules/catalog/application/catalog-banner-query-v2.service.js";
import { SequelizeCatalogBannerV2Repository } from "../../src/modules/catalog/persistence/catalog-banner-query-v2.repository.js";
import type { CatalogMediaProvider } from "../../src/modules/catalog/application/catalog-media-provider.js";
import type { CatalogMediaCleanupLog } from "../../src/modules/catalog/application/catalog-media-cleanup-log.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};

const fakeMediaProvider: CatalogMediaProvider = {
    upload: vi.fn(async () => ({ kind: "uploaded" as const, asset: { url: "https://example.com/img.jpg", publicId: "banners/fake" } })),
    delete: vi.fn(async () => ({ kind: "deleted" as const })),
};
const fakeCleanupLog: CatalogMediaCleanupLog = { recordFailedCleanup: vi.fn() };

describe.skipIf(!runDatabaseV2Tests)("Database V2 banner metadata commands on MySQL", () => {
    let sequelize: Sequelize;
    let command: CatalogBannerCommandV2Service;
    let query: CatalogBannerQueryV2Service;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        const persistence = createSalesV2Persistence(sequelize);
        command = new CatalogBannerCommandV2Service({
            repository: new SequelizeCatalogBannerCommandV2Repository(persistence),
            mediaProvider: fakeMediaProvider,
            cleanupLog: fakeCleanupLog,
        });
        query = new CatalogBannerQueryV2Service({
            repository: new SequelizeCatalogBannerV2Repository(persistence),
        });
    });

    afterAll(async () => { await sequelize?.close(); });

    it("creates draft metadata, updates to active and appears in the public directory", async () => {
        const name = `Banner ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name, targetUrl: "/products" });
        expect(created.kind).toBe("created");
        if (created.kind !== "created") return;
        const initial = await sequelize.query<{ status: string; image: unknown; targetUrl: string }>(
            "SELECT status, image, target_url AS targetUrl FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        expect(initial[0]).toMatchObject({ status: "draft", image: null, targetUrl: "/products" });
        expect(await command.update(manager, created.bannerId, { status: "active", name: ` ${name} updated ` }))
            .toEqual({ kind: "updated" });
        const listed = await query.list({ page: 1, limit: 100 });
        expect(listed).toMatchObject({ kind: "banners" });
        if (listed.kind === "banners") {
            expect(listed.page.banners).toContainEqual({
                id: created.bannerId, name: `${name} updated`, image: null, targetUrl: "/products",
            });
        }
        expect(await command.delete(manager, created.bannerId)).toEqual({ kind: "deleted" });
        const remaining = await sequelize.query<{ id: string }>(
            "SELECT id FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        expect(remaining).toHaveLength(0);
    });

    it("deletes a row with external media and schedules cleanup via fake provider", async () => {
        const name = `Media banner ${crypto.randomUUID()}`;
        const publicId = `banners/${crypto.randomUUID()}`;
        await sequelize.query(
            "INSERT INTO banners (name, image, target_url, status, created_at, updated_at) VALUES (?, JSON_OBJECT('url', ?, 'publicId', ?), NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [name, "https://res.cloudinary.com/demo/image/upload/banner.jpg", publicId] },
        );
        const rows = await sequelize.query<{ id: string }>(
            "SELECT id FROM banners WHERE name = ?", { replacements: [name], type: QueryTypes.SELECT },
        );
        const id = rows[0]?.id;
        expect(id).toBeDefined();
        // Now delete should succeed and attempt media cleanup via fake provider.
        expect(await command.delete(manager, id)).toEqual({ kind: "deleted" });
        const remaining = await sequelize.query<{ id: string }>(
            "SELECT id FROM banners WHERE id = ?", { replacements: [id], type: QueryTypes.SELECT },
        );
        expect(remaining).toHaveLength(0);
        // Fake provider should have been asked to delete the old publicId.
        expect(fakeMediaProvider.delete).toHaveBeenCalledWith(publicId);
    });
});
