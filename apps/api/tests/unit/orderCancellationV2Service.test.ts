import { describe, expect, it, vi } from "vitest";
import { OrderCancellationV2Service } from "../../src/modules/commerce/application/order-cancellation-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const manager: V2AccessContext = {
    accountId: "11", customerId: null, employeeId: "12",
    grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "33" }, permissions: ["order.manage.branch"] }],
};

describe("V2 order cancellation boundary", () => {
    it("rejects callers without management permission on the actual order branch", async () => {
        const findBranch = vi.fn().mockResolvedValue("45");
        const cancel = vi.fn();
        const service = new OrderCancellationV2Service({ repository: { findBranch, cancel } });
        expect(await service.cancel({ ...manager, grants: [] }, "44", "Khách yêu cầu")).toEqual({ kind: "forbidden" });
        expect(await service.cancel(manager, "44", "Khách yêu cầu")).toEqual({ kind: "forbidden" });
        expect(cancel).not.toHaveBeenCalled();
    });

    it("validates reason and passes only DB-derived actor/branch to the repository", async () => {
        const findBranch = vi.fn().mockResolvedValue("33");
        const cancel = vi.fn().mockResolvedValue({ kind: "cancelled", orderId: "44" });
        const service = new OrderCancellationV2Service({ repository: { findBranch, cancel } });
        expect(await service.cancel(manager, "44", " ")).toEqual({ kind: "invalid_reason" });
        expect(await service.cancel(manager, "44", " Khách yêu cầu ")).toEqual({ kind: "cancelled", orderId: "44" });
        expect(cancel).toHaveBeenCalledWith({ orderId: "44", branchId: "33", actorAccountId: "11", reason: "Khách yêu cầu" });
    });
});
