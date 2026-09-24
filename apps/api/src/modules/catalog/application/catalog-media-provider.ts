/**
 * Port for external media storage (Cloudinary, S3, etc.).
 *
 * Application services depend only on this interface; the concrete adapter
 * (e.g. Cloudinary SDK) lives in infrastructure.  Tests inject a
 * FakeCatalogMediaProvider that never calls a real provider.
 */

export type MediaAsset = {
    /** Public-facing URL of the uploaded asset. */
    readonly url: string;
    /** Provider-specific identifier used for deletion/replacement. */
    readonly publicId: string;
};

export type MediaUploadInput = {
    readonly buffer: Buffer;
    readonly mimetype: string;
    readonly originalname: string;
};

export type MediaUploadResult =
    | { readonly kind: "uploaded"; readonly asset: MediaAsset }
    | { readonly kind: "invalid_file"; readonly reason: string }
    | { readonly kind: "provider_error"; readonly message: string };

export type MediaDeleteResult =
    | { readonly kind: "deleted" }
    | { readonly kind: "not_found" }
    | { readonly kind: "provider_error"; readonly message: string };

export interface CatalogMediaProvider {
    /**
     * Upload a file under a server-reserved catalog asset ID.
     * Returns the asset on success or a structured error.
     */
    upload(input: MediaUploadInput, publicId: string): Promise<MediaUploadResult>;

    /**
     * Delete an asset by its provider-specific public ID.
     * Returns `deleted` or `not_found` on success, `provider_error` on failure.
     */
    delete(publicId: string): Promise<MediaDeleteResult>;
}

/** Asset IDs are server-generated and constrained to catalog-owned folders. */
export const isOwnedBannerAsset = (publicId: string): boolean =>
    /^banners\/[A-Za-z0-9_-]{1,92}$/.test(publicId);
export const isOwnedProductAsset = (publicId: string): boolean =>
    /^products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId);
export const isOwnedCatalogAsset = (publicId: string): boolean =>
    isOwnedBannerAsset(publicId) || isOwnedProductAsset(publicId);

export const MAX_BANNER_IMAGE_BYTES = 5 * 1024 * 1024;
export const BANNER_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PRODUCT_IMAGES = 5;

/** MIME is not trusted alone: reject uploads whose leading bytes disagree with it. */
export const hasCatalogImageSignature = (file: MediaUploadInput): boolean => {
    const bytes = file.buffer;
    if (!Buffer.isBuffer(bytes)) return false;
    if (file.mimetype === "image/jpeg") {
        return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (file.mimetype === "image/png") {
        return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return file.mimetype === "image/webp" && bytes.length >= 12
        && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
};
