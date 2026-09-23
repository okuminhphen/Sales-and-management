import { describe, expect, it, vi } from "vitest";
import { ReviewQueryV2Service } from "../../src/modules/review/application/review-query-v2.service.js";

describe("ReviewQueryV2Service", () => {
    it("normalizes BIGINT product ID and defaults pagination", async () => {
        const listByProductId = vi.fn().mockResolvedValue({
            items: [], page: 1, limit: 20, totalItems: 0, totalPages: 0,
        });
        const service = new ReviewQueryV2Service({ repository: { listByProductId } });
        await expect(service.listByProductId("0007")).resolves.toMatchObject({ kind: "reviews" });
        expect(listByProductId).toHaveBeenCalledWith("7", { page: 1, limit: 20 });
    });

    it("rejects unsafe IDs and pagination before querying", async () => {
        const listByProductId = vi.fn();
        const service = new ReviewQueryV2Service({ repository: { listByProductId } });
        for (const [productId, query] of [
            [7, undefined], ["0", undefined], ["7", { page: 0 }],
            ["7", { limit: 101 }], ["7", { page: Number.MAX_SAFE_INTEGER, limit: 100 }],
        ] as const) {
            await expect(service.listByProductId(productId, query))
                .resolves.toEqual({ kind: "invalid_review_query" });
        }
        expect(listByProductId).not.toHaveBeenCalled();
    });

    it("hides database failures", async () => {
        const service = new ReviewQueryV2Service({
            repository: { listByProductId: vi.fn().mockRejectedValue(new Error("SQL details")) },
        });
        await expect(service.listByProductId("7")).resolves.toEqual({ kind: "reviews_unavailable" });
    });
});
