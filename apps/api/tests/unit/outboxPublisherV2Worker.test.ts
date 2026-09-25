import { describe, expect, it } from "vitest";
import { OutboxPublisherV2Worker, type OutboxV2Job } from "../../src/modules/outbox/application/outbox-publisher-v2.worker.js";
import { PUBLISHABLE_V2_EVENT_TYPES } from "../../src/modules/outbox/persistence/outbox-publisher-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const job: OutboxV2Job = {
    id: serializeEntityId("9007199254740993"), attempt: 1,
    event: { eventId: "a32345aa-4113-4d3e-a89b-366e62640001", eventType: "catalog.product.upserted",
        aggregateType: "product", aggregateId: "9007199254740994", payload: { product_id: "9007199254740994" },
        occurredAt: "2026-09-25T00:00:00.000Z" },
};

describe("V2 outbox publisher worker", () => {
    it("never sends internal media-cleanup jobs to RabbitMQ", () => {
        expect(PUBLISHABLE_V2_EVENT_TYPES).toContain("catalog.product.upserted");
        expect(PUBLISHABLE_V2_EVENT_TYPES).toContain("commerce.order.created");
        expect(PUBLISHABLE_V2_EVENT_TYPES).not.toContain("catalog.product.media_cleanup_requested");
        expect(PUBLISHABLE_V2_EVENT_TYPES).not.toContain("catalog.banner.media_upload_reserved");
    });
    it("marks published only after the broker confirms the same event identity", async () => {
        const sequence: string[] = [];
        const worker = new OutboxPublisherV2Worker({
            repository: {
                claimNext: async () => job,
                markPublished: async (id, attempt) => { sequence.push(`marked:${id}:${attempt}`); return true; },
                markFailed: async () => { throw new Error("must not fail"); },
            },
            publisher: { publish: async (event) => { sequence.push(`published:${event.eventId}`); } },
        });
        expect(await worker.runOnce()).toBe("published");
        expect(sequence).toEqual([`published:${job.event.eventId}`, `marked:${job.id}:1`]);
    });

    it("keeps the event unpublished when the broker rejects it", async () => {
        const sequence: string[] = [];
        const worker = new OutboxPublisherV2Worker({
            repository: {
                claimNext: async () => job,
                markPublished: async () => { throw new Error("must not mark published"); },
                markFailed: async (id, attempt) => { sequence.push(`failed:${id}:${attempt}`); return true; },
            },
            publisher: { publish: async () => { throw new Error("broker unavailable"); } },
        });
        expect(await worker.runOnce()).toBe("failed");
        expect(sequence).toEqual([`failed:${job.id}:1`]);
    });
});
