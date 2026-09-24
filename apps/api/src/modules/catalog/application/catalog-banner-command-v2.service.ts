import { randomUUID } from "node:crypto";
import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { canManageBanners } from "./catalog-banner-policy.js";
import { toCatalogPublicTargetUrl } from "./catalog-public-media.js";
import type { CatalogMediaProvider, MediaAsset, MediaUploadInput, MediaUploadResult } from "./catalog-media-provider.js";
import type { CatalogMediaCleanupLog } from "./catalog-media-cleanup-log.js";
import { MAX_BANNER_IMAGE_BYTES, BANNER_IMAGE_MIME_TYPES, hasCatalogImageSignature } from "./catalog-media-provider.js";

export type BannerStatus = "draft" | "active" | "inactive";
export type BannerMetadata = { name: string; targetUrl: string | null; status: BannerStatus };
export type BannerMetadataPatch = Partial<BannerMetadata>;
export type BannerCommandOutcome =
    | { kind: "created"; bannerId: EntityId }
    | { kind: "updated" }
    | { kind: "deleted" }
    | { kind: "banner_not_found" }
    | { kind: "media_cleanup_required" }
    | { kind: "image_uploaded" }
    | { kind: "upload_failed"; reason: string };
export type BannerCommandResult = BannerCommandOutcome
    | { kind: "forbidden" }
    | { kind: "invalid_banner" }
    | { kind: "catalog_unavailable" };

/** Persistence port for banner metadata and durable media intents. */
export interface CatalogBannerCommandV2Repository {
    reserveUpload: (publicId: string) => Promise<void>;
    create: (metadata: BannerMetadata, asset?: MediaAsset) => Promise<{ kind: "created"; bannerId: EntityId }>;
    update: (id: EntityId, patch: BannerMetadataPatch, asset?: MediaAsset) => Promise<
        { kind: "updated"; oldPublicId?: string | null } | { kind: "banner_not_found" }
    >;
    deleteWithoutMedia: (id: EntityId) => Promise<
        { kind: "deleted" } | { kind: "banner_not_found" } | { kind: "media_cleanup_required" }
    >;
    setImage: (id: EntityId, asset: MediaAsset) => Promise<
        { kind: "image_set"; oldPublicId: string | null } | { kind: "banner_not_found" }
    >;
    clearImageAndDelete: (id: EntityId) => Promise<
        { kind: "deleted"; oldPublicId: string | null } | { kind: "banner_not_found" }
    >;
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === "object" && input !== null && !Array.isArray(input);

const normalizeName = (input: unknown): string | undefined => {
    if (typeof input !== "string") return undefined;
    const name = input.trim();
    return name.length >= 1 && name.length <= 255 ? name : undefined;
};

const normalizeStatus = (input: unknown): BannerStatus | undefined =>
    input === "draft" || input === "active" || input === "inactive" ? input : undefined;

const normalizeTargetUrl = (input: unknown): string | null | undefined => {
    if (input === null || input === "") return null;
    if (typeof input !== "string") return undefined;
    const targetUrl = input.trim();
    if (!targetUrl) return null;
    return targetUrl.length <= 1000 ? toCatalogPublicTargetUrl(targetUrl) ?? undefined : undefined;
};

const acceptedKeys = new Set(["name", "targetUrl", "status"]);
const hasOnlyMetadata = (input: Record<string, unknown>): boolean =>
    Object.keys(input).every((key) => acceptedKeys.has(key));

const normalizeCreate = (input: unknown): BannerMetadata | null => {
    if (!isRecord(input) || !hasOnlyMetadata(input)) return null;
    const name = normalizeName(input.name);
    const status = input.status === undefined ? "draft" : normalizeStatus(input.status);
    const targetUrl = input.targetUrl === undefined ? null : normalizeTargetUrl(input.targetUrl);
    if (!name || !status || targetUrl === undefined) return null;
    return { name, status, targetUrl };
};

const normalizePatch = (input: unknown): BannerMetadataPatch | null => {
    if (!isRecord(input) || !hasOnlyMetadata(input) || Object.keys(input).length === 0) return null;
    const patch: BannerMetadataPatch = {};
    if ("name" in input) {
        const name = normalizeName(input.name);
        if (!name) return null;
        patch.name = name;
    }
    if ("status" in input) {
        const status = normalizeStatus(input.status);
        if (!status) return null;
        patch.status = status;
    }
    if ("targetUrl" in input) {
        const targetUrl = normalizeTargetUrl(input.targetUrl);
        if (targetUrl === undefined) return null;
        patch.targetUrl = targetUrl;
    }
    return patch;
};

const parseId = (input: unknown): EntityId | null => {
    try { return serializeEntityId(input); } catch { return null; }
};

export type CatalogBannerCommandDependencies = {
    repository: CatalogBannerCommandV2Repository;
    mediaProvider: CatalogMediaProvider;
    cleanupLog: CatalogMediaCleanupLog;
};

export class CatalogBannerCommandV2Service {
    constructor(private readonly dependencies: CatalogBannerCommandDependencies) {}

    async create(context: V2AccessContext, input: unknown, file?: MediaUploadInput): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const metadata = normalizeCreate(input);
        if (!metadata) return { kind: "invalid_banner" };
        if (file === undefined) {
            try { return await this.dependencies.repository.create(metadata); }
            catch { return { kind: "catalog_unavailable" }; }
        }
        const upload = await this.prepareUpload(file);
        if (upload.kind !== "uploaded") return upload;
        try { return await this.dependencies.repository.create(metadata, upload.asset); }
        catch {
            // A failed acknowledgement does not prove rollback. The durable worker
            // reconciles the reservation against DB references before deleting.
            return { kind: "catalog_unavailable" };
        }
    }

    async update(context: V2AccessContext, idInput: unknown, input: unknown, file?: MediaUploadInput): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        const patch = file !== undefined && isRecord(input) && Object.keys(input).length === 0 ? {} : normalizePatch(input);
        if (!id || !patch) return { kind: "invalid_banner" };
        if (file === undefined) {
            try {
                const result = await this.dependencies.repository.update(id, patch);
                return result.kind === "updated" ? { kind: "updated" } : result;
            } catch { return { kind: "catalog_unavailable" }; }
        }
        const upload = await this.prepareUpload(file);
        if (upload.kind !== "uploaded") return upload;
        let result: Awaited<ReturnType<CatalogBannerCommandV2Repository["update"]>>;
        try { result = await this.dependencies.repository.update(id, patch, upload.asset); }
        catch {
            // Commit may have succeeded; do not delete an image still referenced by DB.
            return { kind: "catalog_unavailable" };
        }
        if (result.kind === "banner_not_found") {
            await this.cleanupOrphan(upload.asset);
            return result;
        }
        if (result.oldPublicId) await this.cleanupOldMedia(result.oldPublicId, "image_replaced");
        return { kind: "updated" };
    }

    async delete(context: V2AccessContext, idInput: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_banner" };
        let result: Awaited<ReturnType<CatalogBannerCommandV2Repository["clearImageAndDelete"]>>;
        try { result = await this.dependencies.repository.clearImageAndDelete(id); }
        catch { return { kind: "catalog_unavailable" }; }
        if (result.kind === "banner_not_found") return result;
        // Cleanup intent was committed with the banner deletion; this direct attempt is optional.
        if (result.oldPublicId) await this.cleanupOldMedia(result.oldPublicId, "banner_deleted");
        return { kind: "deleted" };
    }

    /**
     * Upload an image to a banner. If the banner already has an image, the old
     * image is scheduled for cleanup after the DB commit succeeds.
     *
     * Pattern: reserve upload → provider upload → transact DB and queue old-media
     * cleanup → attempt immediate cleanup. Pending intents survive a process crash.
     */
    async uploadImage(
        context: V2AccessContext,
        idInput: unknown,
        file: MediaUploadInput,
    ): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_banner" };
        const uploadResult = await this.prepareUpload(file);
        if (uploadResult.kind !== "uploaded") return uploadResult;

        let dbResult: Awaited<ReturnType<CatalogBannerCommandV2Repository["setImage"]>>;
        try { dbResult = await this.dependencies.repository.setImage(id, uploadResult.asset); }
        catch {
            // Commit may have succeeded; the worker safely reconciles pending intents.
            return { kind: "catalog_unavailable" };
        }
        if (dbResult.kind === "banner_not_found") {
            await this.cleanupOrphan(uploadResult.asset);
            return dbResult;
        }
        if (dbResult.oldPublicId) await this.cleanupOldMedia(dbResult.oldPublicId, "image_replaced");
        return { kind: "image_uploaded" };
    }

    private async prepareUpload(file: MediaUploadInput): Promise<
        { kind: "uploaded"; asset: MediaAsset } | { kind: "upload_failed"; reason: string } | { kind: "catalog_unavailable" }
    > {
        if (!file || typeof file !== "object") {
            return { kind: "upload_failed", reason: "invalid_content" };
        }
        if (!BANNER_IMAGE_MIME_TYPES.has(file.mimetype)) {
            return { kind: "upload_failed", reason: "unsupported_format" };
        }
        if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || !hasCatalogImageSignature(file)) {
            return { kind: "upload_failed", reason: "invalid_content" };
        }
        if (file.buffer.length > MAX_BANNER_IMAGE_BYTES) {
            return { kind: "upload_failed", reason: "file_too_large" };
        }

        // A durable cleanup candidate exists before any external upload can succeed.
        const publicId = `banners/${randomUUID()}`;
        try {
            await this.dependencies.repository.reserveUpload(publicId);
        } catch {
            return { kind: "catalog_unavailable" };
        }
        let uploadResult: MediaUploadResult;
        try {
            uploadResult = await this.dependencies.mediaProvider.upload(file, publicId);
        } catch {
            return { kind: "upload_failed", reason: "provider_unavailable" };
        }
        if (uploadResult.kind === "invalid_file") {
            return { kind: "upload_failed", reason: uploadResult.reason };
        }
        if (uploadResult.kind === "provider_error") {
            return { kind: "upload_failed", reason: "provider_unavailable" };
        }
        if (uploadResult.asset.publicId !== publicId) {
            return { kind: "upload_failed", reason: "provider_invalid_response" };
        }

        return uploadResult;
    }

    private async cleanupOrphan(asset: MediaAsset): Promise<void> {
        // The durable reservation remains pending even when this immediate attempt fails.
        await this.dependencies.mediaProvider.delete(asset.publicId).catch(() => {});
    }

    /** Best-effort cleanup of an old media asset after DB has committed. */
    private async cleanupOldMedia(publicId: string, reason: string): Promise<void> {
        const deleteResult = await this.dependencies.mediaProvider.delete(publicId).catch((error: unknown) => ({
            kind: "provider_error" as const,
            message: error instanceof Error ? error.message : String(error),
        }));
        if (deleteResult && deleteResult.kind === "provider_error") {
            try {
                this.dependencies.cleanupLog.recordFailedCleanup({
                    publicId,
                    reason,
                    error: deleteResult.message,
                    timestamp: new Date().toISOString(),
                });
            } catch {
                // Logging is diagnostic only. The durable outbox job remains pending for retry.
            }
        }
    }
}
