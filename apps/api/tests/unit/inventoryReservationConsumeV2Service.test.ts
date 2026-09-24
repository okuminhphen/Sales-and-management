import { describe, expect, it } from "vitest";
import { InventoryReservationConsumeV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-consume-v2.service.js";

describe("InventoryReservationConsumeV2Service", () => {
    it("validates reservation ID and operation key before storage", async () => {
        let calls = 0;
        const service = new InventoryReservationConsumeV2Service({ repository: { consumeOrderReservation: async () => {
            calls += 1; return { kind: "consumed", balanceAfter: 0 };
        } } });
        expect(await service.consume("0", "handover-1")).toEqual({ kind: "invalid_consume_input" });
        expect(await service.consume("1", " ")).toEqual({ kind: "invalid_consume_input" });
        expect(calls).toBe(0);
        expect(await service.consume("1", "handover-1")).toEqual({ kind: "consumed", balanceAfter: 0 });
    });

    it("maps unexpected storage failure to a safe result", async () => {
        const service = new InventoryReservationConsumeV2Service({ repository: { consumeOrderReservation: async () => { throw Error("private"); } } });
        expect(await service.consume("1", "handover-2")).toEqual({ kind: "inventory_unavailable" });
    });
});
