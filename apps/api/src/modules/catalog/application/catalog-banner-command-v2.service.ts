import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { canManageBanners } from "./catalog-banner-policy.js";
import { toCatalogPublicTargetUrl } from "./catalog-public-media.js";
import type { CatalogMediaProvider, MediaAsset, MediaUploadInput } from "./catalog-media-provider.js";
import type { CatalogMediaCleanupLog } from "./catalog-media-cleanup-log.js";

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

/** Only metadata may be mutated until the media lifecycle has a durable cleanup path. */
export interface CatalogBannerCommandV2Repository {
    create: (metadata: BannerMetadata) => Promise<{ kind: "created"; bannerId: EntityId }>;
    update: (id: EntityId, patch: BannerMetadataPatch) => Promise<
        { kind: "updated" } | { kind: "banner_not_found" }
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

const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CatalogBannerCommandDependencies = {
    repository: CatalogBannerCommandV2Repository;
    mediaProvider: CatalogMediaProvider;
    cleanupLog: CatalogMediaCleanupLog;
};

export class CatalogBannerCommandV2Service {
    constructor(private readonly dependencies: CatalogBannerCommandDependencies) {}

    async create(context: V2AccessContext, input: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const metadata = normalizeCreate(input);
        if (!metadata) return { kind: "invalid_banner" };
        try { return await this.dependencies.repository.create(metadata); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async update(context: V2AccessContext, idInput: unknown, input: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        const patch = normalizePatch(input);
        if (!id || !patch) return { kind: "invalid_banner" };
        try { return await this.dependencies.repository.update(id, patch); }
        catch { return { kind: "catalog_unavailable" }; }
    }

    async delete(context: V2AccessContext, idInput: unknown): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_banner" };
        try {
            const result = await this.dependencies.repository.clearImageAndDelete(id);
            if (result.kind === "banner_not_found") return result;
            // Row is deleted; now attempt to clean up old media (best effort after commit).
            if (result.oldPublicId) {
                await this.cleanupOldMedia(result.oldPublicId, "banner_deleted");
            }
            return { kind: "deleted" };
        } catch { return { kind: "catalog_unavailable" }; }
    }

    /**
     * Upload an image to a banner. If the banner already has an image, the old
     * image is scheduled for cleanup after the DB commit succeeds.
     *
     * Pattern: upload first → transact DB → cleanup old media after commit.
     * If DB fails after upload, the newly uploaded image is cleaned up.
     */
    async uploadImage(
        context: V2AccessContext,
        idInput: unknown,
        file: MediaUploadInput,
    ): Promise<BannerCommandResult> {
        if (!canManageBanners(context)) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_banner" };
        if (!allowedImageMimeTypes.has(file.mimetype)) {
            return { kind: "upload_failed", reason: "unsupported_format" };
        }

        // 1. Upload to provider first (outside DB transaction).
        const uploadResult = await this.dependencies.mediaProvider.upload(file);
        if (uploadResult.kind === "invalid_file") {
            return { kind: "upload_failed", reason: uploadResult.reason };
        }
        if (uploadResult.kind === "provider_error") {
            return { kind: "upload_failed", reason: uploadResult.message };
        }

        // 2. Update DB in transaction (row lock prevents concurrent replace).
        let dbResult: Awaited<ReturnType<CatalogBannerCommandV2Repository["setImage"]>>;
        try {
            dbResult = await this.dependencies.repository.setImage(id, uploadResult.asset);
        } catch {
            // DB failed — clean up the orphaned upload (best effort).
            await this.dependencies.mediaProvider.delete(uploadResult.asset.publicId).catch(() => {});
            return { kind: "catalog_unavailable" };
        }

        if (dbResult.kind === "banner_not_found") {
            // Banner doesn't exist — clean up the uploaded image.
            await this.dependencies.mediaProvider.delete(uploadResult.asset.publicId).catch(() => {});
            return { kind: "banner_not_found" };
        }

        // 3. DB committed — clean up old image (best effort after commit).
        if (dbResult.oldPublicId) {
            await this.cleanupOldMedia(dbResult.oldPublicId, "image_replaced");
        }

        return { kind: "image_uploaded" };
    }

    /** Best-effort cleanup of an old media asset after DB has committed. */
    private async cleanupOldMedia(publicId: string, reason: string): Promise<void> {
        const deleteResult = await this.dependencies.mediaProvider.delete(publicId).catch((error: unknown) => ({
            kind: "provider_error" as const,
            message: error instanceof Error ? error.message : String(error),
        }));
        if (deleteResult && deleteResult.kind === "provider_error") {
            this.dependencies.cleanupLog.recordFailedCleanup({
                publicId,
                reason,
                error: deleteResult.message,
                timestamp: new Date().toISOString(),
            });
        }
    }
}
