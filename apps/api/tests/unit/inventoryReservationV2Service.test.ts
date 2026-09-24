import { describe, expect, it } from "vitest";
import { InventoryReservationV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-v2.service.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("InventoryReservationV2Service", () => {
    it("validates the order item, expiry and idempotency key before persistence", async () => {
        let calls = 0;
        const service = new InventoryReservationV2Service({ repository: {
            reserveOrderItem: async () => { calls += 1; return { kind: "reserved", reservationId: serializeEntityId("3"), quantity: 2 }; },
        }, now: () => new Date("2026-09-24T00:00:00Z") });
        expect(await service.reserveOrderItem({ orderItemId: "bad", idempotencyKey: "key", expiresAt: new Date("2026-09-25T00:00:00Z") })).toEqual({ kind: "invalid_reservation_input" });
        expect(await service.reserveOrderItem({ orderItemId: "1", idempotencyKey: "", expiresAt: new Date("2026-09-25T00:00:00Z") })).toEqual({ kind: "invalid_reservation_input" });
        expect(await service.reserveOrderItem({ orderItemId: "1", idempotencyKey: "key", expiresAt: new Date("2026-09-23T00:00:00Z") })).toEqual({ kind: "invalid_reservation_input" });
        expect(calls).toBe(0);
        expect(await service.reserveOrderItem({ orderItemId: "1", idempotencyKey: "key", expiresAt: new Date("2026-09-25T00:00:00Z") })).toEqual({ kind: "reserved", reservationId: "3", quantity: 2 });
    });

    it("fails closed on an unexpected persistence error", async () => {
        const service = new InventoryReservationV2Service({ repository: {
            reserveOrderItem: async () => { throw Error("private database detail"); },
        } });
        expect(await service.reserveOrderItem({ orderItemId: "1", idempotencyKey: "key", expiresAt: new Date(Date.now() + 60_000) })).toEqual({ kind: "inventory_unavailable" });
    });

    it("does not retry a deadlocked repository call that may belong to a checkout transaction", async () => {
        let calls = 0;
        const deadlock = { parent: { code: "ER_LOCK_DEADLOCK" } };
        const service = new InventoryReservationV2Service({ repository: {
            reserveOrderItem: async () => {
                calls += 1;
                throw deadlock;
            },
        } });
        await expect(service.reserveOrderItem({ orderItemId: "1", idempotencyKey: "key", expiresAt: new Date(Date.now() + 60_000) }))
            .rejects.toBe(deadlock);
        expect(calls).toBe(1);
    });
});
