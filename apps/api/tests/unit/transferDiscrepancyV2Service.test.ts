import { describe, expect, it, vi } from "vitest";
import { TransferDiscrepancyV2Service } from "../../src/modules/inventory-transfer/application/transfer-discrepancy-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe("TransferDiscrepancyV2Service", () => {
    const context: V2AccessContext = { accountId: "11", customerId: null, employeeId: null,
        grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "31" },
            permissions: ["transfer.manage.branch"] }] };
    const item = { itemId: "51", receivedQuantity: 2, lostQuantity: 1, nonSellableQuantity: 0 };

    it("requires a destination grant, reason and at least one discrepant item", async () => {
        const record = vi.fn().mockResolvedValue({ kind: "recorded" });
        const service = new TransferDiscrepancyV2Service({ repository: {
            findDestinationBranch: vi.fn().mockResolvedValue("32"), record,
            approve: vi.fn(),
        } });
        expect(await service.record(context, "41", [item], "  ")).toEqual({ kind: "invalid_discrepancy" });
        expect(await service.record(context, "41", [{ ...item, receivedQuantity: 3, lostQuantity: 0 }], "Reason"))
            .toEqual({ kind: "invalid_discrepancy" });
        expect(await service.record(context, "41", [item], "Reason")).toEqual({ kind: "forbidden" });
        expect(record).not.toHaveBeenCalled();
    });

    it("derives the recorder from the access context", async () => {
        const record = vi.fn().mockResolvedValue({ kind: "recorded" });
        const service = new TransferDiscrepancyV2Service({ repository: {
            findDestinationBranch: vi.fn().mockResolvedValue("31"), record,
            approve: vi.fn(),
        } });
        expect(await service.record(context, "41", [item], "  Missing  ")).toEqual({ kind: "recorded" });
        expect(record).toHaveBeenCalledExactlyOnceWith("41", "11", "31", [item], "Missing");
    });

    it("requires a global grant to approve and never takes an approver from the body", async () => {
        const approve = vi.fn().mockResolvedValue({ kind: "completed", transferReceiptId: "41" });
        const service = new TransferDiscrepancyV2Service({ repository: {
            findDestinationBranch: vi.fn(), record: vi.fn(), approve,
        } });
        expect(await service.approve(context, "41", "Approved")).toEqual({ kind: "forbidden" });
        const admin: V2AccessContext = { ...context, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["transfer.manage.branch"] }] };
        expect(await service.approve(admin, "41", "   ")).toEqual({ kind: "invalid_discrepancy" });
        expect(await service.approve(admin, "41", "  Approved  "))
            .toEqual({ kind: "completed", transferReceiptId: "41" });
        expect(approve).toHaveBeenCalledExactlyOnceWith("41", "11", "Approved");
    });
});
