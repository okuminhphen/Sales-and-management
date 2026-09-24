import { describe, expect, it } from "vitest";
import { InventoryTransferReservationV2Service } from "../../src/modules/inventory-transfer/application/inventory-transfer-reservation-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("InventoryTransferReservationV2Service", () => {
    it("validates the transfer item and idempotency key before persistence", async () => {
        let calls = 0;
        const service = new InventoryTransferReservationV2Service({ repository: {
            reserveTransferItem: async () => { calls += 1; return { kind: "reserved", reservationId: serializeEntityId("9"), quantity: 2 }; },
        } });
        expect(await service.reserveTransferItem({ transferItemId: "0", idempotencyKey: "key" })).toEqual({ kind: "invalid_reservation_input" });
        expect(await service.reserveTransferItem({ transferItemId: "1", idempotencyKey: "bad key" })).toEqual({ kind: "invalid_reservation_input" });
        expect(await service.reserveTransferItem({ transferItemId: "1", idempotencyKey: "key" })).toEqual({ kind: "reserved", reservationId: "9", quantity: 2 });
        expect(calls).toBe(1);
    });

    it("does not leak database failures", async () => {
        const service = new InventoryTransferReservationV2Service({ repository: {
            reserveTransferItem: async () => { throw Error("private SQL"); },
        } });
        expect(await service.reserveTransferItem({ transferItemId: "1", idempotencyKey: "key" })).toEqual({ kind: "inventory_unavailable" });
    });
});
