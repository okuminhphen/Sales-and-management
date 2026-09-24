import { describe, expect, it, vi } from "vitest";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { TransferQueryV2Service } from "../../src/modules/inventory-transfer/application/transfer-query-v2.service.js";

const base: V2AccessContext = { accountId: "11", customerId: null, employeeId: null, grants: [] };

describe("TransferQueryV2Service", () => {
    it("limits branch readers to their assigned branches and rejects an ungranted actor", async () => {
        const list = vi.fn().mockResolvedValue({ receipts: [], page: 1, limit: 20, totalItems: 0 });
        const detail = vi.fn().mockResolvedValue(null);
        const service = new TransferQueryV2Service({ repository: { list, detail } });
        expect(await service.list(base, 1, 20)).toEqual({ kind: "forbidden" });
        expect(list).not.toHaveBeenCalled();
        const customer: V2AccessContext = { ...base, grants: [{ roleCode: "CUSTOMER",
            scope: { type: "branch", branchId: "31" }, permissions: ["transfer.read.branch"] }] };
        expect(await service.list(customer, 1, 20)).toEqual({ kind: "forbidden" });
        const branch: V2AccessContext = { ...base, grants: [
            { roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "31" },
                permissions: ["transfer.read.branch"] },
            { roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "32" },
                permissions: ["transfer.read.branch"] },
        ] };
        expect((await service.list(branch, 1, 20)).kind).toBe("receipts");
        expect(list).toHaveBeenCalledExactlyOnceWith(["31", "32"], 1, 20);
        expect(await service.detail(branch, "41")).toEqual({ kind: "transfer_not_found" });
        expect(detail).toHaveBeenCalledExactlyOnceWith("41", ["31", "32"]);
    });

    it("allows global readers all receipts while validating pagination and string IDs", async () => {
        const list = vi.fn().mockResolvedValue({ receipts: [], page: 2, limit: 10, totalItems: 0 });
        const detail = vi.fn().mockResolvedValue({ id: "41" });
        const service = new TransferQueryV2Service({ repository: { list, detail } });
        const global: V2AccessContext = { ...base, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["transfer.read.branch"] }] };
        expect(await service.list(global, 0, 10)).toEqual({ kind: "invalid_transfer" });
        expect(await service.detail(global, 41)).toEqual({ kind: "invalid_transfer" });
        expect((await service.list(global, 2, 10)).kind).toBe("receipts");
        expect(list).toHaveBeenCalledExactlyOnceWith(null, 2, 10);
        expect(await service.detail(global, "41")).toEqual({ kind: "receipt", receipt: { id: "41" } });
        expect(detail).toHaveBeenCalledExactlyOnceWith("41", null);
    });
});
