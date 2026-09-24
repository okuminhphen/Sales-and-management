import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { CatalogBannerCommandV2Service } from "../../src/modules/catalog/application/catalog-banner-command-v2.service.js";
import { SequelizeCatalogBannerCommandV2Repository } from "../../src/modules/catalog/persistence/catalog-banner-command-v2.repository.js";
import { SequelizeCatalogMediaCleanupV2Repository } from "../../src/modules/catalog/persistence/catalog-media-cleanup-v2.repository.js";
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
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webpBytes = Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBPdata");

// ─── Fake provider for integration tests (no real Cloudinary) ──

class FakeCatalogMediaProvider implements CatalogMediaProvider {
    readonly uploads: MediaUploadInput[] = [];
    readonly deletions: string[] = [];
    private counter = 0;
    private readonly runId = crypto.randomUUID();
    deleteResult: MediaDeleteResult = { kind: "deleted" };

    async upload(input: MediaUploadInput, publicId: string): Promise<MediaUploadResult> {
        this.uploads.push(input);
        this.counter += 1;
        return {
            kind: "uploaded",
            asset: {
                url: `https://res.cloudinary.com/demo/image/upload/banners/${this.runId}-${this.counter}.jpg`,
                publicId,
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
            buffer: jpegBytes,
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
        const reservations = await sequelize.query<{ publishedAt: Date | null }>(
            "SELECT published_at AS publishedAt FROM outbox_events WHERE event_type = 'catalog.banner.media_upload_reserved' AND aggregate_id = ?",
            { replacements: [image.publicId], type: QueryTypes.SELECT },
        );
        expect(reservations).toHaveLength(1);
        expect(reservations[0]?.publishedAt).not.toBeNull();
    });

    it("replaces an existing image and returns the old publicId for cleanup", async () => {
        const name = `Replace ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name });
        if (created.kind !== "created") return;

        const file1: MediaUploadInput = { buffer: pngBytes, mimetype: "image/png", originalname: "a.png" };
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
        const file2: MediaUploadInput = { buffer: webpBytes, mimetype: "image/webp", originalname: "b.webp" };
        const replaceResult = await command.uploadImage(manager, created.bannerId, file2);
        expect(replaceResult).toEqual({ kind: "image_uploaded" });

        // The old publicId should have been passed to media.delete.
        expect(media.deletions.slice(deletionsBefore)).toContain(oldPublicId);
        const cleanupEvents = await sequelize.query<{ publishedAt: Date | null }>(
            "SELECT published_at AS publishedAt FROM outbox_events WHERE event_type = 'catalog.banner.media_cleanup_requested' AND aggregate_id = ?",
            { replacements: [oldPublicId], type: QueryTypes.SELECT },
        );
        expect(cleanupEvents).toHaveLength(1);
        expect(cleanupEvents[0]?.publishedAt).toBeNull();

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

        const file: MediaUploadInput = { buffer: jpegBytes, mimetype: "image/jpeg", originalname: "d.jpg" };
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
        const cleanupEvents = await sequelize.query<{ publishedAt: Date | null }>(
            "SELECT published_at AS publishedAt FROM outbox_events WHERE event_type = 'catalog.banner.media_cleanup_requested' AND aggregate_id = ?",
            { replacements: [publicId], type: QueryTypes.SELECT },
        );
        expect(cleanupEvents).toHaveLength(1);
        expect(cleanupEvents[0]?.publishedAt).toBeNull();
    });

    it("records failed cleanup in the log when media provider fails after DB delete", async () => {
        const name = `FailCleanup ${crypto.randomUUID()}`;
        const created = await command.create(manager, { name });
        if (created.kind !== "created") return;

        const file: MediaUploadInput = { buffer: jpegBytes, mimetype: "image/jpeg", originalname: "fc.jpg" };
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

    it("claims and acknowledges a durable media job through the MySQL adapter", async () => {
        const repository = new SequelizeCatalogMediaCleanupV2Repository(createSalesV2Persistence(sequelize));
        const job = await repository.claimNext();
        expect(job).not.toBeNull();
        if (!job) return;
        expect(job.attempts).toBeGreaterThan(0);
        expect(job.publicId).toMatch(/^(banners|products)\//);
        if (!await repository.isReferenced(job.publicId)) {
            expect(await media.delete(job.publicId)).toEqual({ kind: "deleted" });
        }
        await repository.markCompleted(job.id);
        const rows = await sequelize.query<{ publishedAt: Date | null; lockedAt: Date | null }>(
            "SELECT published_at AS publishedAt, locked_at AS lockedAt FROM outbox_events WHERE id = ?",
            { replacements: [job.id], type: QueryTypes.SELECT },
        );
        expect(rows[0]?.publishedAt).not.toBeNull();
        expect(rows[0]?.lockedAt).toBeNull();
    });
});
