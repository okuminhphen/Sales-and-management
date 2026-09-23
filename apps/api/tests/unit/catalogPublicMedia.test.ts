import { describe, expect, it } from "vitest";
import {
    toCatalogPublicImage,
    toCatalogPublicImages,
    toCatalogPublicTargetUrl,
} from "../../src/modules/catalog/application/catalog-public-media.js";

describe("catalog public media normalization", () => {
    it("keeps only explicit HTTP(S) image URLs from untrusted JSON", () => {
        expect(toCatalogPublicImage({ url: "https://cdn.example.com/banner.jpg", publicId: "private-id" }))
            .toEqual({ url: "https://cdn.example.com/banner.jpg" });
        expect(toCatalogPublicImages([
            { url: "https://cdn.example.com/one.jpg" },
            { url: "javascript:alert(1)" },
            { publicId: "no-url" },
            "https://cdn.example.com/not-an-object.jpg",
        ])).toEqual([{ url: "https://cdn.example.com/one.jpg" }]);
    });

    it("allows only safe in-app or HTTP(S) banner destinations", () => {
        expect(toCatalogPublicTargetUrl("/products?sort=new")).toBe("/products?sort=new");
        expect(toCatalogPublicTargetUrl("https://example.com/campaign")).toBe("https://example.com/campaign");
        expect(toCatalogPublicTargetUrl("//evil.example.com")).toBeNull();
        expect(toCatalogPublicTargetUrl("/\\evil.example.com")).toBeNull();
        expect(toCatalogPublicTargetUrl("javascript:alert(1)")).toBeNull();
    });
});
