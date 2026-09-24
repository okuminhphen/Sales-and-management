import { describe, expect, it } from "vitest";
import { InventoryAdjustmentV2Service } from "../../src/modules/inventory-transfer/application/inventory-adjustment-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const manager: V2AccessContext = { accountId: "7", customerId: null, employeeId: "8", grants: [
    { roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "1" }, permissions: ["inventory.manage.branch"] },
] };

describe("InventoryAdjustmentV2Service", () => {
    it("checks branch permission and validates the adjustment before persistence", async () => {
        let calls = 0;
        const service = new InventoryAdjustmentV2Service({ repository: { adjust: async () => {
            calls += 1; return { kind: "adjusted", movementId: serializeEntityId("3"), balanceAfter: 4 };
        } } });
        const input = { branchId: "1", variantId: "2", quantityDelta: -1, reason: "Count correction", idempotencyKey: "adjust-1" };
        expect(await service.adjust({ ...manager, grants: [] }, input)).toEqual({ kind: "forbidden" });
        expect(await service.adjust(manager, { ...input, branchId: "2" })).toEqual({ kind: "forbidden" });
        expect(await service.adjust(manager, { ...input, quantityDelta: 0 })).toEqual({ kind: "invalid_adjustment_input" });
        expect(await service.adjust(manager, { ...input, reason: " " })).toEqual({ kind: "invalid_adjustment_input" });
        expect(calls).toBe(0);
        expect(await service.adjust(manager, input)).toEqual({ kind: "adjusted", movementId: "3", balanceAfter: 4 });
    });

    it("fails closed on a repository error", async () => {
        const service = new InventoryAdjustmentV2Service({ repository: { adjust: async () => { throw Error("private"); } } });
        expect(await service.adjust(manager, { branchId: "1", variantId: "2", quantityDelta: 1,
            reason: "Count correction", idempotencyKey: "adjust-2" })).toEqual({ kind: "inventory_unavailable" });
    });
});
