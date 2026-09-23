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
     * Upload a file to the `banners` folder.
     * Returns the asset on success or a structured error.
     */
    upload(input: MediaUploadInput): Promise<MediaUploadResult>;

    /**
     * Delete an asset by its provider-specific public ID.
     * Returns `deleted` or `not_found` on success, `provider_error` on failure.
     */
    delete(publicId: string): Promise<MediaDeleteResult>;
}
