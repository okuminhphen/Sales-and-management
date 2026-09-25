import { describe, expect, it, vi } from "vitest";
import { OrderConfirmationV2Service } from "../../src/modules/commerce/application/order-confirmation-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const branchManager: V2AccessContext = {
    accountId: "11", customerId: null, employeeId: "12",
    grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "33" }, permissions: ["order.manage.branch"] }],
};

describe("V2 order confirmation boundary", () => {
    it("requires an internal order-management grant for the order's actual branch", async () => {
        const findBranch = vi.fn().mockResolvedValue("45");
        const confirm = vi.fn();
        const service = new OrderConfirmationV2Service({ repository: { findBranch, confirm } });
        expect(await service.confirm({ ...branchManager, customerId: "99", grants: [] }, "44")).toEqual({ kind: "forbidden" });
        expect(await service.confirm(branchManager, "45")).toEqual({ kind: "forbidden" });
        expect(confirm).not.toHaveBeenCalled();
    });

    it("passes only DB-derived actor and the immutable branch to the atomic repository", async () => {
        const findBranch = vi.fn().mockResolvedValue("33");
        const confirm = vi.fn().mockResolvedValue({ kind: "confirmed", orderId: "44" });
        const service = new OrderConfirmationV2Service({ repository: { findBranch, confirm } });
        expect(await service.confirm(branchManager, "44")).toEqual({ kind: "confirmed", orderId: "44" });
        expect(confirm).toHaveBeenCalledWith({ orderId: "44", branchId: "33", actorAccountId: "11" });
    });
});
