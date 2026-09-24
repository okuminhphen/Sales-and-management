import { randomUUID } from "node:crypto";
import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import {
    BANNER_IMAGE_MIME_TYPES, hasCatalogImageSignature, MAX_BANNER_IMAGE_BYTES, MAX_PRODUCT_IMAGES,
    type CatalogMediaProvider, type MediaAsset, type MediaUploadInput,
} from "./catalog-media-provider.js";

export interface CatalogProductMediaV2Repository {
    exists: (id: EntityId) => Promise<boolean>;
    reserveUpload: (publicId: string) => Promise<void>;
    replaceImages: (id: EntityId, assets: readonly MediaAsset[]) => Promise<"updated" | "product_not_found">;
    clearImages: (id: EntityId) => Promise<"updated" | "product_not_found">;
}

export type ProductMediaResult =
    | { kind: "updated" | "product_not_found" | "forbidden" | "invalid_product_input" }
    | { kind: "invalid_media"; reason: "unsupported_format" | "invalid_content" | "file_too_large" | "file_count" }
    | { kind: "media_unavailable" | "catalog_unavailable" };

const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** Replaces a bounded image set; reservations make orphan cleanup crash-safe. */
export class CatalogProductMediaV2Service {
    constructor(private readonly dependencies: {
        repository: CatalogProductMediaV2Repository;
        mediaProvider: CatalogMediaProvider;
    }) {}

    async replace(context: V2AccessContext, idInput: unknown, files: readonly MediaUploadInput[]): Promise<ProductMediaResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_product_input" };
        if (!Array.isArray(files) || files.length < 1 || files.length > MAX_PRODUCT_IMAGES) {
            return { kind: "invalid_media", reason: "file_count" };
        }
        for (const file of files) {
            if (!file || typeof file !== "object") return { kind: "invalid_media", reason: "invalid_content" };
            if (!BANNER_IMAGE_MIME_TYPES.has(file.mimetype)) return { kind: "invalid_media", reason: "unsupported_format" };
            if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || !hasCatalogImageSignature(file)) {
                return { kind: "invalid_media", reason: "invalid_content" };
            }
            if (file.buffer.length > MAX_BANNER_IMAGE_BYTES) return { kind: "invalid_media", reason: "file_too_large" };
        }
        try {
            if (!await this.dependencies.repository.exists(id)) return { kind: "product_not_found" };
        } catch { return { kind: "catalog_unavailable" }; }
        const assets: MediaAsset[] = [];
        for (const file of files) {
            const publicId = `products/${randomUUID()}`;
            try { await this.dependencies.repository.reserveUpload(publicId); }
            catch { return { kind: "catalog_unavailable" }; }
            let result;
            try { result = await this.dependencies.mediaProvider.upload(file, publicId); }
            catch { return { kind: "media_unavailable" }; }
            if (result.kind !== "uploaded" || result.asset.publicId !== publicId) {
                return { kind: "media_unavailable" };
            }
            assets.push(result.asset);
        }
        try {
            const result = await this.dependencies.repository.replaceImages(id, assets);
            return { kind: result };
        } catch {
            // A missing commit acknowledgement does not prove rollback. The reservation
            // worker checks DB references before deleting uploaded images.
            return { kind: "catalog_unavailable" };
        }
    }

    async clear(context: V2AccessContext, idInput: unknown): Promise<ProductMediaResult> {
        if (!hasGlobalPermission(context, "catalog.manage.global")) return { kind: "forbidden" };
        const id = parseId(idInput);
        if (!id) return { kind: "invalid_product_input" };
        try { return { kind: await this.dependencies.repository.clearImages(id) }; }
        catch { return { kind: "catalog_unavailable" }; }
    }
}
