export type CatalogPublicImage = {
    url: string;
};

const maximumUrlLength = 2_000;
const internalNavigationOrigin = "https://catalog.internal.invalid";

const isSafeHttpUrl = (value: unknown): value is string => {
    if (typeof value !== "string" || value.length === 0 || value.length > maximumUrlLength) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
};

/** Converts untrusted JSON media stored by legacy-compatible catalog tables into a safe public image. */
export const toCatalogPublicImage = (value: unknown): CatalogPublicImage | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (!Object.prototype.hasOwnProperty.call(value, "url")) return null;
    const url = (value as Record<string, unknown>).url;
    return isSafeHttpUrl(url) ? { url } : null;
};

export const toCatalogPublicImages = (value: unknown): readonly CatalogPublicImage[] =>
    Array.isArray(value)
        ? value.flatMap((image) => {
            const publicImage = toCatalogPublicImage(image);
            return publicImage ? [publicImage] : [];
        })
        : [];

/** Accepts an in-app absolute path or a conventional HTTP(S) landing URL, never protocol-relative URLs. */
export const toCatalogPublicTargetUrl = (value: unknown): string | null => {
    if (typeof value !== "string" || value.length === 0 || value.length > maximumUrlLength) return null;
    if (value.startsWith("/") && !/[\u0000-\u001F]/.test(value)) {
        try {
            if (new URL(value, internalNavigationOrigin).origin === internalNavigationOrigin) return value;
        } catch {
            return null;
        }
    }
    return isSafeHttpUrl(value) ? value : null;
};
