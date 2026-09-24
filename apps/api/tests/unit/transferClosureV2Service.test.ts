import { describe, expect, it, vi } from "vitest";
import { TransferClosureV2Service } from "../../src/modules/inventory-transfer/application/transfer-closure-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe("TransferClosureV2Service", () => {
    const manager: V2AccessContext = { accountId: "11", customerId: null, employeeId: null,
        grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "31" },
            permissions: ["transfer.manage.branch"] }] };

    it("uses branch permission for cancellation but requires global permission for rejection", async () => {
        const close = vi.fn().mockResolvedValue({ kind: "cancelled" });
        const service = new TransferClosureV2Service({ repository: {
            findSourceBranch: vi.fn().mockResolvedValue("31"), close,
        } });
        expect(await service.cancel(manager, "41")).toEqual({ kind: "cancelled" });
        expect(close).toHaveBeenCalledExactlyOnceWith("41", "11", "31", "cancelled", null);
        expect(await service.reject(manager, "41", "Reason")).toEqual({ kind: "forbidden" });
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("rejects numeric IDs and an empty reason before mutation", async () => {
        const close = vi.fn();
        const service = new TransferClosureV2Service({ repository: {
            findSourceBranch: vi.fn().mockResolvedValue("31"), close,
        } });
        expect(await service.cancel(manager, 9007199254740992)).toEqual({ kind: "invalid_transfer" });
        expect(await service.reject(manager, "41", "  ")).toEqual({ kind: "invalid_transfer" });
        expect(close).not.toHaveBeenCalled();
    });
});
