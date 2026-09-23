import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { CatalogBannerCommandV2Service } from "../../src/modules/catalog/application/catalog-banner-command-v2.service.js";
import { SequelizeCatalogBannerCommandV2Repository } from "../../src/modules/catalog/persistence/catalog-banner-command-v2.repository.js";
import type {
    CatalogMediaProvider,
    MediaUploadInput,
    MediaUploadResult,
    MediaDeleteResult,
} from "../../src/modules/catalog/application/catalog-media-provider.js";
import type {
    CatalogMediaCleanupLog,
    MediaCleanupEntry,
} from "../../src/modules/catalog/application/catalog-media-cleanup-log.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};

// ─── Fake provider for integration tests (no real Cloudinary) ──

class FakeCatalogMediaProvider implements CatalogMediaProvider {
    readonly uploads: MediaUploadInput[] = [];
    readonly deletions: string[] = [];
    private counter = 0;
    deleteResult: MediaDeleteResult = { kind: "deleted" };

    async upload(input: MediaUploadInput): Promise<MediaUploadResult> {
        this.uploads.push(input);
        this.counter += 1;
        return {
            kind: "uploaded",
            asset: {
                url: `https://res.cloudinary.com/demo/image/upload/banners/test-${this.counter}.jpg`,
                publicId: `banners/test-${this.counter}`,
            },
        };
    }

    async delete(publicId: string): Promise<MediaDeleteResult> {
        this.deletions.push(publicId);
        return this.deleteResult;
    }
}

class FakeCleanupLog implements CatalogMediaCleanupLog {
    readonly entries: MediaCleanupEntry[] = [];
    recordFailedCleanup(entry: MediaCleanupEntry): void { this.entries.push(entry); }
}

describe.skipIf(!runDatabaseV2Tests)("Database V2 banner media lifecycle on MySQL", () => {
    let sequelize: Sequelize;
    let media: FakeCatalogMediaProvider;
    let cleanupLog: FakeCleanupLog;
    let command: CatalogBannerCommandV2Service;

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
        media = new FakeCatalogMediaProvider();
        cleanupLog = new FakeCleanupLog();
        command = new CatalogBannerCommandV2Service({
            repository: new SequelizeCatalogBannerCommandV2Repository(persistence),
            mediaProvider: media,
            cleanupLog,
        });
    });

    afterAll(async () => { await sequelize?.close(); });

    it("uploads an image and persists the url/publicId JSON in the banner row", async () => {
        const name = `Upload ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name });
        expect(created.kind).toBe("created");
        if (created.kind !== "created") return;

        const file: MediaUploadInput = {
            buffer: Buffer.from("test-jpeg-data"),
            mimetype: "image/jpeg",
            originalname: "hero.jpg",
        };
        const uploadResult = await command.uploadImage(manager, created.bannerId, file);
        expect(uploadResult).toEqual({ kind: "image_uploaded" });

        // Verify DB row has the image JSON.
        const rows = await sequelize.query<{ image: string }>(
            "SELECT image FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        const image = typeof rows[0]?.image === "string" ? JSON.parse(rows[0].image) : rows[0]?.image;
        expect(image).toMatchObject({ url: expect.stringContaining("https://"), publicId: expect.stringContaining("banners/") });
    });

    it("replaces an existing image and returns the old publicId for cleanup", async () => {
        const name = `Replace ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name });
        if (created.kind !== "created") return;

        const file1: MediaUploadInput = { buffer: Buffer.from("first"), mimetype: "image/png", originalname: "a.png" };
        await command.uploadImage(manager, created.bannerId, file1);

        // Record the publicId that was set.
        const rowsBefore = await sequelize.query<{ image: string }>(
            "SELECT image FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        const imageBefore = typeof rowsBefore[0]?.image === "string" ? JSON.parse(rowsBefore[0].image) : rowsBefore[0]?.image;
        const oldPublicId = imageBefore?.publicId;
        expect(oldPublicId).toBeTruthy();

        // Upload a second image — the first one should be scheduled for cleanup.
        const deletionsBefore = media.deletions.length;
        const file2: MediaUploadInput = { buffer: Buffer.from("second"), mimetype: "image/webp", originalname: "b.webp" };
        const replaceResult = await command.uploadImage(manager, created.bannerId, file2);
        expect(replaceResult).toEqual({ kind: "image_uploaded" });

        // The old publicId should have been passed to media.delete.
        expect(media.deletions.slice(deletionsBefore)).toContain(oldPublicId);

        // DB row should have the NEW image.
        const rowsAfter = await sequelize.query<{ image: string }>(
            "SELECT image FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        const imageAfter = typeof rowsAfter[0]?.image === "string" ? JSON.parse(rowsAfter[0].image) : rowsAfter[0]?.image;
        expect(imageAfter?.publicId).not.toBe(oldPublicId);
    });

    it("deletes a banner with an image, removes the row, and cleans up media", async () => {
        const name = `Delete ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name });
        if (created.kind !== "created") return;

        const file: MediaUploadInput = { buffer: Buffer.from("del"), mimetype: "image/jpeg", originalname: "d.jpg" };
        await command.uploadImage(manager, created.bannerId, file);

        // Record the publicId.
        const rows = await sequelize.query<{ image: string }>(
            "SELECT image FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        const image = typeof rows[0]?.image === "string" ? JSON.parse(rows[0].image) : rows[0]?.image;
        const publicId = image?.publicId;
        expect(publicId).toBeTruthy();

        const deletionsBefore = media.deletions.length;
        const deleteResult = await command.delete(manager, created.bannerId);
        expect(deleteResult).toEqual({ kind: "deleted" });

        // Row should be gone.
        const remaining = await sequelize.query<{ id: string }>(
            "SELECT id FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        expect(remaining).toHaveLength(0);

        // Media provider should have been called to delete the old asset.
        expect(media.deletions.slice(deletionsBefore)).toContain(publicId);
    });

    it("records failed cleanup in the log when media provider fails after DB delete", async () => {
        const name = `FailCleanup ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name });
        if (created.kind !== "created") return;

        const file: MediaUploadInput = { buffer: Buffer.from("fc"), mimetype: "image/jpeg", originalname: "fc.jpg" };
        await command.uploadImage(manager, created.bannerId, file);

        // Make the provider fail on delete.
        media.deleteResult = { kind: "provider_error", message: "Cloudinary 503" };
        const logEntriesBefore = cleanupLog.entries.length;

        const deleteResult = await command.delete(manager, created.bannerId);
        expect(deleteResult).toEqual({ kind: "deleted" });

        // Row gone.
        const remaining = await sequelize.query<{ id: string }>(
            "SELECT id FROM banners WHERE id = ?",
            { replacements: [created.bannerId], type: QueryTypes.SELECT },
        );
        expect(remaining).toHaveLength(0);

        // Cleanup log should have recorded the failure.
        const newEntries = cleanupLog.entries.slice(logEntriesBefore);
        expect(newEntries).toHaveLength(1);
        expect(newEntries[0]).toMatchObject({
            reason: "banner_deleted",
            error: "Cloudinary 503",
        });
        expect(newEntries[0]?.publicId).toBeTruthy();

        // Reset for other tests.
        media.deleteResult = { kind: "deleted" };
    });
});
