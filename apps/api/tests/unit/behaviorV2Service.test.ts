import { describe, expect, it, vi } from "vitest";
import { BehaviorV2Service, type BehaviorV2Repository } from "../../src/modules/communication-ai/application/behavior-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const context = { accountId: "1", customerId: "2", employeeId: null, grants: [] } as unknown as V2AccessContext;
const repository: BehaviorV2Repository = {
    recordView: vi.fn(async () => true),
    toggleLike: vi.fn(async () => true),
    getLikeStatus: vi.fn(async () => false),
};

describe("BehaviorV2Service", () => {
    it("derives customer identity from access context", async () => {
        const service = new BehaviorV2Service(repository);
        await expect(service.recordView(context, "3")).resolves.toEqual({ kind: "view_recorded" });
        expect(repository.recordView).toHaveBeenCalledWith("2", "3");
    });

    it("rejects invalid product IDs and non-customers before persistence", async () => {
        const service = new BehaviorV2Service(repository);
        await expect(service.toggleLike(context, 3)).resolves.toEqual({ kind: "invalid_product_id" });
        await expect(service.getLikeStatus({ ...context, customerId: null }, "3")).resolves.toEqual({ kind: "customer_required" });
    });
});
