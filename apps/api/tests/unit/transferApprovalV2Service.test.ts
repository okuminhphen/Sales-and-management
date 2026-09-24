import { describe, expect, it, vi } from "vitest";
import { TransferApprovalV2Service } from "../../src/modules/inventory-transfer/application/transfer-approval-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe("TransferApprovalV2Service", () => {
    const accountId = "11";
    const context: V2AccessContext = { accountId, customerId: null, employeeId: null,
        grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["transfer.manage.branch"] }] };

    it("rejects numeric IDs before repository access", async () => {
        const approve = vi.fn();
        const service = new TransferApprovalV2Service({ repository: { approve } });
        expect(await service.approve(context, 9007199254740992)).toEqual({ kind: "invalid_transfer" });
        expect(approve).not.toHaveBeenCalled();
    });

    it("requires a global transfer grant and derives the actor from the access context", async () => {
        const approve = vi.fn().mockResolvedValue({ kind: "approved", transferReceiptId: "21" });
        const service = new TransferApprovalV2Service({ repository: { approve } });
        const branchContext: V2AccessContext = { ...context, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: "31" }, permissions: ["transfer.manage.branch"] }] };
        expect(await service.approve(branchContext, "21")).toEqual({ kind: "forbidden" });
        expect(await service.approve(context, "21")).toEqual({ kind: "approved", transferReceiptId: "21" });
        expect(approve).toHaveBeenCalledExactlyOnceWith("21", accountId);
    });
});
