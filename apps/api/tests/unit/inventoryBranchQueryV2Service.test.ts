import { describe, expect, it } from "vitest";
import { InventoryBranchQueryV2Service } from "../../src/modules/inventory-transfer/application/inventory-branch-query-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const context: V2AccessContext = { accountId: "1", customerId: null, employeeId: "2", grants: [
    { roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "3" }, permissions: ["inventory.read.branch"] },
] };

describe("InventoryBranchQueryV2Service", () => {
    it("enforces branch scope before reading", async () => {
        let calls = 0;
        const service = new InventoryBranchQueryV2Service({ repository: { listByBranch: async () => { calls += 1; return []; } } });
        expect(await service.list(context, "4")).toEqual({ kind: "forbidden" });
        expect(await service.list({ ...context, grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: ["inventory.read.branch"] }] }, "3")).toEqual({ kind: "forbidden" });
        expect(calls).toBe(0);
        expect(await service.list(context, "3")).toEqual({ kind: "inventory", products: [] });
    });

    it("distinguishes invalid input, missing branch and storage outage", async () => {
        const missing = new InventoryBranchQueryV2Service({ repository: { listByBranch: async () => null } });
        expect(await missing.list(context, "nope")).toEqual({ kind: "invalid_inventory_query" });
        expect(await missing.list(context, "3")).toEqual({ kind: "branch_not_found" });
        const unavailable = new InventoryBranchQueryV2Service({ repository: { listByBranch: async () => { throw Error("private"); } } });
        expect(await unavailable.list(context, "3")).toEqual({ kind: "inventory_unavailable" });
    });
});
