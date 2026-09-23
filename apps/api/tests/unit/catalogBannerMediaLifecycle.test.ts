import { describe, expect, it, vi } from "vitest";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import {
    CatalogBannerCommandV2Service,
    type CatalogBannerCommandV2Repository,
    type CatalogBannerCommandDependencies,
} from "../../src/modules/catalog/application/catalog-banner-command-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";
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

// ─── Fixtures ──────────────────────────────────────────────────

const manager: V2AccessContext = {
    accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }],
};
const customer: V2AccessContext = {
    accountId: "3", customerId: "4", employeeId: null, grants: [],
};

const jpegFile: MediaUploadInput = {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]),
    mimetype: "image/jpeg",
    originalname: "banner.jpg",
};

const pngFile: MediaUploadInput = {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimetype: "image/png",
    originalname: "banner.png",
};

const gifFile: MediaUploadInput = {
    buffer: Buffer.from("fake-gif-data"),
    mimetype: "image/gif",
    originalname: "banner.gif",
};

// ─── Fake implementations ──────────────────────────────────────

class FakeCatalogMediaProvider implements CatalogMediaProvider {
    readonly uploads: MediaUploadInput[] = [];
    readonly requestedIds: string[] = [];
    readonly deletions: string[] = [];
    uploadResult: MediaUploadResult = {
        kind: "uploaded",
        asset: { url: "https://res.cloudinary.com/demo/image/upload/banners/new.jpg", publicId: "banners/new-id" },
    };
    deleteResult: MediaDeleteResult = { kind: "deleted" };

    async upload(input: MediaUploadInput, publicId: string): Promise<MediaUploadResult> {
        this.uploads.push(input);
        this.requestedIds.push(publicId);
        return this.uploadResult.kind === "uploaded"
            ? { kind: "uploaded", asset: { ...this.uploadResult.asset, publicId } }
            : this.uploadResult;
    }

    async delete(publicId: string): Promise<MediaDeleteResult> {
        this.deletions.push(publicId);
        return this.deleteResult;
    }
}

class FakeCatalogMediaCleanupLog implements CatalogMediaCleanupLog {
    readonly entries: MediaCleanupEntry[] = [];
    recordFailedCleanup(entry: MediaCleanupEntry): void {
        this.entries.push(entry);
    }
}

const makeRepository = (): CatalogBannerCommandV2Repository => ({
    reserveUpload: vi.fn(async () => {}),
    create: vi.fn(async () => ({ kind: "created" as const, bannerId: serializeEntityId("7") })),
    update: vi.fn(async () => ({ kind: "updated" as const })),
    deleteWithoutMedia: vi.fn(async () => ({ kind: "deleted" as const })),
    setImage: vi.fn(async () => ({ kind: "image_set" as const, oldPublicId: null })),
    clearImageAndDelete: vi.fn(async () => ({ kind: "deleted" as const, oldPublicId: null })),
});

const makeDeps = (
    overrides?: Partial<CatalogBannerCommandDependencies>,
): { deps: CatalogBannerCommandDependencies; repo: CatalogBannerCommandV2Repository; media: FakeCatalogMediaProvider; log: FakeCatalogMediaCleanupLog } => {
    const repo = makeRepository();
    const media = new FakeCatalogMediaProvider();
    const log = new FakeCatalogMediaCleanupLog();
    const deps: CatalogBannerCommandDependencies = {
        repository: repo,
        mediaProvider: media,
        cleanupLog: log,
        ...overrides,
    };
    return { deps, repo, media, log };
};

// ─── Tests ─────────────────────────────────────────────────────

describe("Banner media lifecycle — uploadImage", () => {
    it("rejects a missing upload before reserving media", async () => {
        const { deps, repo, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);
        await expect(service.uploadImage(manager, "7", undefined as unknown as MediaUploadInput))
            .resolves.toEqual({ kind: "upload_failed", reason: "invalid_content" });
        expect(repo.reserveUpload).not.toHaveBeenCalled();
        expect(media.uploads).toHaveLength(0);
    });

    it("uploads image to provider, sets image in DB, and returns image_uploaded", async () => {
        const { deps, repo, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "image_uploaded" });
        expect(media.uploads).toHaveLength(1);
        expect(media.uploads[0]).toBe(jpegFile);
        expect(repo.setImage).toHaveBeenCalledWith(
            serializeEntityId("7"),
            { url: "https://res.cloudinary.com/demo/image/upload/banners/new.jpg", publicId: media.requestedIds[0] },
        );
    });

    it("returns upload_failed for unsupported MIME type without calling provider", async () => {
        const { deps, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", gifFile);

        expect(result).toEqual({ kind: "upload_failed", reason: "unsupported_format" });
        expect(media.uploads).toHaveLength(0);
    });

    it("returns upload_failed when provider reports invalid_file", async () => {
        const { deps, media } = makeDeps();
        media.uploadResult = { kind: "invalid_file", reason: "corrupted_header" };
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", pngFile);

        expect(result).toEqual({ kind: "upload_failed", reason: "corrupted_header" });
    });

    it("returns upload_failed when provider reports provider_error", async () => {
        const { deps, media } = makeDeps();
        media.uploadResult = { kind: "provider_error", message: "rate limited" };
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "upload_failed", reason: "provider_unavailable" });
    });

    it("defers cleanup to reconciliation when the DB outcome is uncertain", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.setImage).mockRejectedValueOnce(new Error("DB connection lost"));
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "catalog_unavailable" });
        expect(media.deletions).toEqual([]);
    });

    it("does not contact the provider unless the cleanup candidate was durably reserved", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.reserveUpload).mockRejectedValueOnce(new Error("outbox unavailable"));
        const result = await new CatalogBannerCommandV2Service(deps).uploadImage(manager, "7", jpegFile);
        expect(result).toEqual({ kind: "catalog_unavailable" });
        expect(media.uploads).toHaveLength(0);
    });

    it("keeps a durable candidate on a DB error without trusting provider availability", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.setImage).mockRejectedValueOnce(new Error("DB connection lost"));
        media.deleteResult = { kind: "provider_error", message: "timeout" };
        const result = await new CatalogBannerCommandV2Service(deps).uploadImage(manager, "7", jpegFile);
        expect(result).toEqual({ kind: "catalog_unavailable" });
        expect(repo.reserveUpload).toHaveBeenCalledWith(media.requestedIds[0]);
        expect(media.deletions).toEqual([]);
    });

    it("cleans up orphan upload when banner does not exist", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.setImage).mockResolvedValueOnce({ kind: "banner_not_found" });
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "banner_not_found" });
        expect(media.deletions).toEqual([media.requestedIds[0]]);
    });

    it("schedules cleanup of old image when replacing an existing image", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.setImage).mockResolvedValueOnce({ kind: "image_set", oldPublicId: "banners/old-id" });
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "image_uploaded" });
        // Old image should be cleaned up.
        expect(media.deletions).toEqual(["banners/old-id"]);
    });

    it("logs failed cleanup of old image after successful DB commit", async () => {
        const { deps, repo, media, log } = makeDeps();
        vi.mocked(repo.setImage).mockResolvedValueOnce({ kind: "image_set", oldPublicId: "banners/old-id" });
        media.deleteResult = { kind: "provider_error", message: "timeout" };
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "image_uploaded" });
        expect(log.entries).toHaveLength(1);
        expect(log.entries[0]).toMatchObject({
            publicId: "banners/old-id",
            reason: "image_replaced",
            error: "timeout",
        });
        expect(log.entries[0]?.timestamp).toBeTruthy();
    });

    it("does not attempt old-image cleanup when there was no previous image", async () => {
        const { deps, repo, media, log } = makeDeps();
        vi.mocked(repo.setImage).mockResolvedValueOnce({ kind: "image_set", oldPublicId: null });
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, "7", jpegFile);

        expect(result).toEqual({ kind: "image_uploaded" });
        expect(media.deletions).toHaveLength(0);
        expect(log.entries).toHaveLength(0);
    });

    it("requires global catalog permission for upload", async () => {
        const { deps, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(customer, "7", jpegFile);

        expect(result).toEqual({ kind: "forbidden" });
        expect(media.uploads).toHaveLength(0);
    });

    it("rejects invalid banner ID for upload", async () => {
        const { deps, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.uploadImage(manager, 0, jpegFile);

        expect(result).toEqual({ kind: "invalid_banner" });
        expect(media.uploads).toHaveLength(0);
    });

    it("accepts image/webp MIME type", async () => {
        const { deps, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);

        const webpFile: MediaUploadInput = { buffer: Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBPdata"), mimetype: "image/webp", originalname: "banner.webp" };
        const result = await service.uploadImage(manager, "7", webpFile);

        expect(result).toEqual({ kind: "image_uploaded" });
        expect(media.uploads).toHaveLength(1);
    });

    it("rejects a forged image MIME when the bytes are not an image", async () => {
        const { deps, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);
        const result = await service.uploadImage(manager, "7", {
            buffer: Buffer.from("not an image"), mimetype: "image/jpeg", originalname: "fake.jpg",
        });
        expect(result).toEqual({ kind: "upload_failed", reason: "invalid_content" });
        expect(media.uploads).toHaveLength(0);
    });

    it("rejects an image larger than 5 MiB before calling the provider", async () => {
        const { deps, media } = makeDeps();
        const service = new CatalogBannerCommandV2Service(deps);
        const result = await service.uploadImage(manager, "7", {
            buffer: Buffer.concat([jpegFile.buffer, Buffer.alloc(5 * 1024 * 1024)]),
            mimetype: "image/jpeg", originalname: "large.jpg",
        });
        expect(result).toEqual({ kind: "upload_failed", reason: "file_too_large" });
        expect(media.uploads).toHaveLength(0);
    });
});

describe("Banner media lifecycle — delete with media", () => {
    it("deletes banner with image and schedules media cleanup", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.clearImageAndDelete).mockResolvedValueOnce({ kind: "deleted", oldPublicId: "banners/img-1" });
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.delete(manager, "7");

        expect(result).toEqual({ kind: "deleted" });
        expect(media.deletions).toEqual(["banners/img-1"]);
    });

    it("deletes banner without image without calling media provider", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.clearImageAndDelete).mockResolvedValueOnce({ kind: "deleted", oldPublicId: null });
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.delete(manager, "7");

        expect(result).toEqual({ kind: "deleted" });
        expect(media.deletions).toHaveLength(0);
    });

    it("logs failed media cleanup on delete and still returns deleted", async () => {
        const { deps, repo, media, log } = makeDeps();
        vi.mocked(repo.clearImageAndDelete).mockResolvedValueOnce({ kind: "deleted", oldPublicId: "banners/img-1" });
        media.deleteResult = { kind: "provider_error", message: "network error" };
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.delete(manager, "7");

        expect(result).toEqual({ kind: "deleted" });
        expect(log.entries).toHaveLength(1);
        expect(log.entries[0]).toMatchObject({
            publicId: "banners/img-1",
            reason: "banner_deleted",
            error: "network error",
        });
    });

    it("does not claim DB delete failed when diagnostic logging throws after commit", async () => {
        const { deps, repo, media, log } = makeDeps();
        vi.mocked(repo.clearImageAndDelete).mockResolvedValueOnce({ kind: "deleted", oldPublicId: "banners/img-1" });
        media.deleteResult = { kind: "provider_error", message: "timeout" };
        log.recordFailedCleanup = () => { throw new Error("stderr closed"); };
        const result = await new CatalogBannerCommandV2Service(deps).delete(manager, "7");
        expect(result).toEqual({ kind: "deleted" });
    });

    it("returns banner_not_found when banner does not exist", async () => {
        const { deps, repo, media } = makeDeps();
        vi.mocked(repo.clearImageAndDelete).mockResolvedValueOnce({ kind: "banner_not_found" });
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.delete(manager, "7");

        expect(result).toEqual({ kind: "banner_not_found" });
        expect(media.deletions).toHaveLength(0);
    });

    it("returns catalog_unavailable when DB throws during delete", async () => {
        const { deps, repo } = makeDeps();
        vi.mocked(repo.clearImageAndDelete).mockRejectedValueOnce(new Error("lock timeout"));
        const service = new CatalogBannerCommandV2Service(deps);

        const result = await service.delete(manager, "7");

        expect(result).toEqual({ kind: "catalog_unavailable" });
    });
});
