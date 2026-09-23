import { describe, expect, it } from "vitest";
import { CloudinaryCatalogMediaProvider, type CloudinaryMediaOperations } from
    "../../src/modules/catalog/infrastructure/cloudinary-catalog-media.provider.js";

const image = {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]),
    mimetype: "image/jpeg", originalname: "hero.jpg",
};
const publicId = "banners/05bdd20b-d7c3-4327-849d-982587ac1b75";

const setup = (overrides: Partial<CloudinaryMediaOperations> = {}) => {
    const requests: string[] = [];
    const operations: CloudinaryMediaOperations = {
        upload: async (_buffer, requestedId) => {
            requests.push(`upload:${requestedId}`);
            return { public_id: requestedId, secure_url: "https://res.cloudinary.com/demo/image/upload/hero.jpg",
                resource_type: "image" };
        },
        destroy: async (requestedId) => {
            requests.push(`destroy:${requestedId}`);
            return { result: "ok" };
        },
        ...overrides,
    };
    return { provider: new CloudinaryCatalogMediaProvider(operations), requests };
};

describe("CloudinaryCatalogMediaProvider", () => {
    it("uploads under a caller-reserved banner ID and exposes only HTTPS media URL", async () => {
        const { provider, requests } = setup();
        expect(await provider.upload(image, publicId)).toEqual({ kind: "uploaded",
            asset: { publicId, url: "https://res.cloudinary.com/demo/image/upload/hero.jpg" } });
        expect(requests).toEqual([`upload:${publicId}`]);
    });

    it("rejects a provider response that changes public ID or URL origin", async () => {
        const { provider } = setup({ upload: async () => ({ public_id: "other/asset",
            secure_url: "http://attacker.example/image", resource_type: "image" }) });
        expect(await provider.upload(image, publicId)).toEqual({ kind: "provider_error", message: "invalid_response" });
    });

    it("refuses to delete assets outside the banners folder", async () => {
        const { provider, requests } = setup();
        expect(await provider.delete("products/important")).toEqual({ kind: "provider_error", message: "invalid_public_id" });
        expect(requests).toEqual([]);
    });

    it("maps provider deletion results to idempotent outcomes", async () => {
        const { provider } = setup({ destroy: async () => ({ result: "not found" }) });
        expect(await provider.delete(publicId)).toEqual({ kind: "not_found" });
    });
});
