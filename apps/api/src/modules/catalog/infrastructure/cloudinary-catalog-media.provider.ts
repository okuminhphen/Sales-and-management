import cloudinary from "../../../config/cloudinary.js";
import type { CatalogMediaProvider, MediaDeleteResult, MediaUploadInput, MediaUploadResult } from
    "../application/catalog-media-provider.js";
import { isOwnedBannerAsset } from "../application/catalog-media-provider.js";

export type CloudinaryMediaOperations = {
    upload: (buffer: Buffer, publicId: string) => Promise<unknown>;
    destroy: (publicId: string) => Promise<unknown>;
};

const providerTimeoutMs = 30_000;
const withTimeout = async <T>(operation: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Media provider timed out.")), providerTimeoutMs);
        })]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const configuredCloudinaryOperations: CloudinaryMediaOperations = {
    upload: (buffer, publicId) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            public_id: publicId, resource_type: "image", overwrite: false,
            unique_filename: false, use_filename: false,
        }, (error, result) => error ? reject(error) : result ? resolve(result) : reject(new Error("Empty Cloudinary response.")));
        stream.end(buffer);
    }),
    destroy: (publicId) => cloudinary.uploader.destroy(publicId, {
        resource_type: "image", invalidate: true,
    }),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

const isCloudinaryHttpsUrl = (value: unknown): value is string => {
    if (typeof value !== "string" || value.length > 2_000) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
    } catch {
        return false;
    }
};

/** Real provider adapter; callers inject fakes in tests and never upload real fixtures. */
export class CloudinaryCatalogMediaProvider implements CatalogMediaProvider {
    constructor(private readonly operations: CloudinaryMediaOperations = configuredCloudinaryOperations) {}

    async upload(input: MediaUploadInput, publicId: string): Promise<MediaUploadResult> {
        if (!isOwnedBannerAsset(publicId)) return { kind: "invalid_file", reason: "invalid_public_id" };
        try {
            const result = await withTimeout(this.operations.upload(input.buffer, publicId));
            if (!isRecord(result) || result.public_id !== publicId
                || result.resource_type !== "image" || !isCloudinaryHttpsUrl(result.secure_url)) {
                return { kind: "provider_error", message: "invalid_response" };
            }
            return { kind: "uploaded", asset: { publicId, url: result.secure_url } };
        } catch {
            return { kind: "provider_error", message: "provider_unavailable" };
        }
    }

    async delete(publicId: string): Promise<MediaDeleteResult> {
        if (!isOwnedBannerAsset(publicId)) return { kind: "provider_error", message: "invalid_public_id" };
        try {
            const result = await withTimeout(this.operations.destroy(publicId));
            if (!isRecord(result)) return { kind: "provider_error", message: "invalid_response" };
            if (result.result === "ok") return { kind: "deleted" };
            if (result.result === "not found") return { kind: "not_found" };
            return { kind: "provider_error", message: "provider_error" };
        } catch {
            return { kind: "provider_error", message: "provider_unavailable" };
        }
    }
}
