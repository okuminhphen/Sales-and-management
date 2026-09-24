import { describe, expect, it } from "vitest";
import { InventoryBalanceV2Service } from "../../src/modules/inventory-transfer/application/inventory-balance-v2.service.js";

describe("InventoryBalanceV2Service", () => {
    it("reports physical stock and active holds separately", async () => {
        const service = new InventoryBalanceV2Service({ repository: {
            findByBranchAndVariant: async () => ({ branchId: "1", productVariantId: "2", stock: 5, reserved: 3 }),
        } });
        expect(await service.get("1", "2")).toEqual({
            kind: "balance", balance: { branchId: "1", productVariantId: "2", stock: 5, reserved: 3, available: 2 },
        });
    });

    it("rejects malformed IDs and fails closed when active holds exceed stock", async () => {
        const service = new InventoryBalanceV2Service({ repository: {
            findByBranchAndVariant: async () => ({ branchId: "1", productVariantId: "2", stock: 1, reserved: 2 }),
        } });
        expect(await service.get("x", "2")).toEqual({ kind: "invalid_inventory_query" });
        expect(await service.get("1", "2")).toEqual({ kind: "inventory_unavailable" });
    });

    it("distinguishes an absent inventory row from unavailable persistence", async () => {
        const missing = new InventoryBalanceV2Service({ repository: { findByBranchAndVariant: async () => null } });
        expect(await missing.get("1", "2")).toEqual({ kind: "inventory_not_found" });
        const unavailable = new InventoryBalanceV2Service({ repository: { findByBranchAndVariant: async () => { throw Error("database down"); } } });
        expect(await unavailable.get("1", "2")).toEqual({ kind: "inventory_unavailable" });
    });
});
