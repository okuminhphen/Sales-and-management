import { describe, expect, it, vi } from "vitest";
import { TransferReceiptV2Service } from "../../src/modules/inventory-transfer/application/transfer-receipt-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe("TransferReceiptV2Service", () => {
    const context: V2AccessContext = { accountId: "11", customerId: null, employeeId: null,
        grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "31" },
            permissions: ["transfer.manage.branch"] }] };
    const item = { itemId: "51", receivedQuantity: 3, lostQuantity: 0, nonSellableQuantity: 0 };

    it("rejects numeric IDs and duplicate item IDs before mutation", async () => {
        const complete = vi.fn();
        const service = new TransferReceiptV2Service({ repository: {
            findDestinationBranch: vi.fn().mockResolvedValue("31"), complete,
        } });
        expect(await service.complete(context, 9007199254740992, [item])).toEqual({ kind: "invalid_transfer" });
        expect(await service.complete(context, "41", [item, item])).toEqual({ kind: "invalid_transfer" });
        expect(complete).not.toHaveBeenCalled();
    });

    it("permits only the destination branch or global transfer grant", async () => {
        const complete = vi.fn().mockResolvedValue({ kind: "completed", transferReceiptId: "41" });
        const findDestinationBranch = vi.fn().mockResolvedValue("32");
        const service = new TransferReceiptV2Service({ repository: { findDestinationBranch, complete } });
        expect(await service.complete(context, "41", [item])).toEqual({ kind: "forbidden" });
        const admin: V2AccessContext = { ...context, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["transfer.manage.branch"] }] };
        expect(await service.complete(admin, "41", [item])).toEqual({ kind: "completed", transferReceiptId: "41" });
        expect(complete).toHaveBeenCalledExactlyOnceWith("41", "11", "32", [item]);
    });
});
