import { describe, expect, it, vi } from "vitest";
import { TransferDispatchV2Service } from "../../src/modules/inventory-transfer/application/transfer-dispatch-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe("TransferDispatchV2Service", () => {
    const context: V2AccessContext = { accountId: "11", customerId: null, employeeId: null,
        grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "31" },
            permissions: ["transfer.manage.branch"] }] };

    it("rejects unsafe numeric IDs and another branch's manager", async () => {
        const dispatch = vi.fn();
        const findSourceBranch = vi.fn().mockResolvedValue("32");
        const service = new TransferDispatchV2Service({ repository: { dispatch, findSourceBranch } });
        expect(await service.dispatch(context, 9007199254740992)).toEqual({ kind: "invalid_transfer" });
        expect(await service.dispatch(context, "41")).toEqual({ kind: "forbidden" });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("uses the current source branch and account identity", async () => {
        const dispatch = vi.fn().mockResolvedValue({ kind: "dispatched", transferReceiptId: "41" });
        const service = new TransferDispatchV2Service({ repository: {
            findSourceBranch: vi.fn().mockResolvedValue("31"), dispatch,
        } });
        expect(await service.dispatch(context, "41")).toEqual({ kind: "dispatched", transferReceiptId: "41" });
        expect(dispatch).toHaveBeenCalledExactlyOnceWith("41", "11", "31");
    });
});
