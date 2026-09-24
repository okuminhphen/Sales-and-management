import { describe, expect, it, vi } from "vitest";
import { CatalogProductMediaV2Service, type CatalogProductMediaV2Repository } from "../../src/modules/catalog/application/catalog-product-media-v2.service.js";
import type { CatalogMediaProvider, MediaUploadInput } from "../../src/modules/catalog/application/catalog-media-provider.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const manager: V2AccessContext = { accountId: "1", customerId: null, employeeId: null,
    grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["catalog.manage.global"] }] };
const jpeg: MediaUploadInput = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]),
    mimetype: "image/jpeg", originalname: "image.jpg" };

const setup = (failCommit = false) => {
    const reservations: string[] = [];
    const deletions: string[] = [];
    const repository: CatalogProductMediaV2Repository = {
        exists: async () => true,
        reserveUpload: async (publicId) => { reservations.push(publicId); },
        replaceImages: async () => { if (failCommit) throw new Error("acknowledgement lost"); return "updated"; },
        clearImages: async () => "updated",
    };
    const mediaProvider: CatalogMediaProvider = {
        upload: vi.fn(async (_file, publicId) => ({ kind: "uploaded" as const,
            asset: { publicId, url: "https://res.cloudinary.com/demo/image/upload/a.jpg" } })),
        delete: async (publicId) => { deletions.push(publicId); return { kind: "deleted" }; },
    };
    return { service: new CatalogProductMediaV2Service({ repository, mediaProvider }),
        reservations, deletions, mediaProvider };
};

describe("Catalog product media V2", () => {
    it("rejects invalid bytes and a non-global actor before reserving/uploading", async () => {
        const { service, reservations, mediaProvider } = setup();
        await expect(service.replace(manager, "1", [{ ...jpeg, buffer: Buffer.from("fake") }]))
            .resolves.toEqual({ kind: "invalid_media", reason: "invalid_content" });
        await expect(service.replace({ ...manager, grants: [] }, "1", [jpeg]))
            .resolves.toEqual({ kind: "forbidden" });
        expect(reservations).toEqual([]);
        expect(mediaProvider.upload).not.toHaveBeenCalled();
    });

    it("leaves a durable reservation for reconciliation when DB commit acknowledgement is lost", async () => {
        const { service, reservations, deletions, mediaProvider } = setup(true);
        await expect(service.replace(manager, "1", [jpeg]))
            .resolves.toEqual({ kind: "catalog_unavailable" });
        expect(reservations).toHaveLength(1);
        expect(mediaProvider.upload).toHaveBeenCalledOnce();
        expect(deletions).toEqual([]);
    });
});
