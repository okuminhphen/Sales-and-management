import { describe, expect, it } from "vitest";
import { CatalogMediaCleanupV2Worker, type CatalogMediaCleanupV2Repository,
    type CatalogMediaCleanupJob } from "../../src/modules/catalog/application/catalog-media-cleanup-v2.worker.js";
import type { CatalogMediaProvider, MediaDeleteResult } from "../../src/modules/catalog/application/catalog-media-provider.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const job: CatalogMediaCleanupJob = {
    id: serializeEntityId("42"), publicId: "banners/05bdd20b-d7c3-4327-849d-982587ac1b75",
    kind: "upload_reserved", attempts: 1,
};

const setup = (input: { referenced?: boolean; deleteResult?: MediaDeleteResult; queued?: boolean } = {}) => {
    const completed: string[] = [];
    const failed: string[] = [];
    const deleted: string[] = [];
    let queued = input.queued ?? true;
    const repository: CatalogMediaCleanupV2Repository = {
        claimNext: async () => {
            if (!queued) return null;
            queued = false;
            return job;
        },
        isReferenced: async () => input.referenced ?? false,
        markCompleted: async (id) => { completed.push(id); },
        markFailed: async (id, error) => { failed.push(`${id}:${error}`); },
    };
    const mediaProvider: CatalogMediaProvider = {
        upload: async () => ({ kind: "provider_error", message: "unused" }),
        delete: async (publicId) => {
            deleted.push(publicId);
            return input.deleteResult ?? { kind: "deleted" };
        },
    };
    return { worker: new CatalogMediaCleanupV2Worker({ repository, mediaProvider }),
        completed, failed, deleted };
};

describe("CatalogMediaCleanupV2Worker", () => {
    it("deletes an unreferenced media asset and completes its durable job", async () => {
        const { worker, completed, failed, deleted } = setup();
        expect(await worker.runOnce()).toBe(true);
        expect(deleted).toEqual([job.publicId]);
        expect(completed).toEqual([job.id]);
        expect(failed).toEqual([]);
    });

    it("never deletes an asset still referenced by a banner", async () => {
        const { worker, completed, deleted } = setup({ referenced: true });
        expect(await worker.runOnce()).toBe(true);
        expect(deleted).toEqual([]);
        expect(completed).toEqual([job.id]);
    });

    it("keeps the job retryable after a provider failure", async () => {
        const { worker, completed, failed } = setup({
            deleteResult: { kind: "provider_error", message: "upstream timeout" },
        });
        expect(await worker.runOnce()).toBe(true);
        expect(completed).toEqual([]);
        expect(failed).toEqual([`${job.id}:provider_error`]);
    });

    it("treats an already missing asset as idempotent success", async () => {
        const { worker, completed } = setup({ deleteResult: { kind: "not_found" } });
        expect(await worker.runOnce()).toBe(true);
        expect(completed).toEqual([job.id]);
    });

    it("returns false when there are no eligible jobs", async () => {
        const { worker } = setup({ queued: false });
        expect(await worker.runOnce()).toBe(false);
    });

    it("allows a server-owned product asset cleanup job", async () => {
        const deleted: string[] = [];
        const repository: CatalogMediaCleanupV2Repository = {
            claimNext: async () => ({ ...job, publicId: "products/05bdd20b-d7c3-4327-849d-982587ac1b75" }),
            isReferenced: async () => false,
            markCompleted: async () => {},
            markFailed: async () => { throw new Error("Unexpected failure"); },
        };
        const mediaProvider: CatalogMediaProvider = {
            upload: async () => ({ kind: "provider_error", message: "unused" }),
            delete: async (publicId) => { deleted.push(publicId); return { kind: "deleted" }; },
        };
        const worker = new CatalogMediaCleanupV2Worker({ repository, mediaProvider });
        expect(await worker.runOnce()).toBe(true);
        expect(deleted).toEqual(["products/05bdd20b-d7c3-4327-849d-982587ac1b75"]);
    });
});
