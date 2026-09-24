import { describe, expect, it } from "vitest";
import { InventoryReservationReleaseV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-release-v2.service.js";

describe("InventoryReservationReleaseV2Service", () => {
    it("rejects malformed IDs before storage and propagates safe business results", async () => {
        let calls = 0;
        const service = new InventoryReservationReleaseV2Service({ repository: {
            releaseCancelledOrderReservation: async () => { calls += 1; return { kind: "payment_unresolved" }; },
        } });
        expect(await service.releaseCancelled("0")).toEqual({ kind: "invalid_reservation_input" });
        expect(await service.releaseCancelled("1")).toEqual({ kind: "payment_unresolved" });
        expect(calls).toBe(1);
    });

    it("does not leak persistence errors", async () => {
        const service = new InventoryReservationReleaseV2Service({ repository: {
            releaseCancelledOrderReservation: async () => { throw Error("private SQL"); },
        } });
        expect(await service.releaseCancelled("1")).toEqual({ kind: "inventory_unavailable" });
    });
});
