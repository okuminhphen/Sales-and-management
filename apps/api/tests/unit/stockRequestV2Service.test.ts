import { describe, expect, it, vi } from "vitest";
import { StockRequestV2Service, type StockRequestV2Repository } from "../../src/modules/inventory-transfer/application/stock-request-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context = (branchId: string, permission = "stock_request.manage.branch"): V2AccessContext => ({
    accountId: "10", customerId: null, employeeId: "20", grants: [{ roleCode: "BRANCH_MANAGER",
        scope: { type: "branch", branchId }, permissions: [permission] }],
});

describe("StockRequestV2Service.create", () => {
    const input = { fromBranchId: "1", toBranchId: "2", items: [{ productSizeId: "3", quantity: 2 }] };

    it("creates a request only for an authorized requester branch using the authenticated actor", async () => {
        const create = vi.fn().mockResolvedValue({ kind: "created", id: serializeEntityId("7"), code: "RQ7" });
        const service = new StockRequestV2Service({ repository: { create } as unknown as StockRequestV2Repository });
        expect(await service.create(context("1"), input)).toEqual({ kind: "created", id: "7", code: "RQ7" });
        expect(create).toHaveBeenCalledWith({ fromBranchId: "1", toBranchId: "2", actorAccountId: "10",
            items: [{ variantId: "3", quantity: 2, note: null }] });
        expect(await service.create(context("4"), input)).toEqual({ kind: "forbidden" });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it("rejects duplicate variants, same branch, and untrusted numeric IDs", async () => {
        const create = vi.fn();
        const service = new StockRequestV2Service({ repository: { create } as unknown as StockRequestV2Repository });
        expect(await service.create(context("1"), { ...input, toBranchId: "1" })).toEqual({ kind: "invalid_stock_request" });
        expect(await service.create(context("1"), { ...input, items: [...input.items, ...input.items] }))
            .toEqual({ kind: "invalid_stock_request" });
        expect(await service.create(context("1"), { ...input, fromBranchId: 1 as unknown as string }))
            .toEqual({ kind: "invalid_stock_request" });
        expect(create).not.toHaveBeenCalled();
    });
});

describe("StockRequestV2Service.list", () => {
    it("authorizes requester branch reads and requires a global grant for the pending queue", async () => {
        const list = vi.fn().mockResolvedValue({ requests: [], page: 1, limit: 20, totalItems: 0 });
        const repository = { list } as unknown as StockRequestV2Repository;
        const service = new StockRequestV2Service({ repository });
        expect((await service.listByBranch(context("1", "stock_request.read.branch"), "1", 1, 20)).kind)
            .toBe("requests");
        expect(await service.listByBranch(context("2", "stock_request.read.branch"), "1", 1, 20))
            .toEqual({ kind: "forbidden" });
        expect(await service.listPending(context("1", "stock_request.read.branch"), 1, 20))
            .toEqual({ kind: "forbidden" });
        const admin: V2AccessContext = { accountId: "10", customerId: null, employeeId: null, grants: [{
            roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["stock_request.read.branch"],
        }] };
        expect((await service.listPending(admin, 1, 20)).kind).toBe("requests");
        expect(list).toHaveBeenCalledTimes(2);
    });
});
