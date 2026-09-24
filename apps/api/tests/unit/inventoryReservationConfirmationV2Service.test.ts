import { describe, expect, it } from "vitest";
import { InventoryReservationConfirmationV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-confirmation-v2.service.js";

describe("InventoryReservationConfirmationV2Service", () => {
    it("rejects malformed IDs before touching persistence", async () => {
        let calls = 0;
        const service = new InventoryReservationConfirmationV2Service({ repository: {
            confirmOrderReservation: async () => { calls += 1; return { kind: "confirmed" }; },
        } });
        expect(await service.confirm("0")).toEqual({ kind: "invalid_reservation_input" });
        expect(await service.confirm("1")).toEqual({ kind: "confirmed" });
        expect(calls).toBe(1);
    });

    it("does not leak a storage error", async () => {
        const service = new InventoryReservationConfirmationV2Service({ repository: {
            confirmOrderReservation: async () => { throw Error("private SQL"); },
        } });
        expect(await service.confirm("1")).toEqual({ kind: "inventory_unavailable" });
    });
});
