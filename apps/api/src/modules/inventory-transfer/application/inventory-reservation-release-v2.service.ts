import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReservationReleaseOutcome = { kind:
    "released" | "replayed" | "reservation_not_found" | "order_not_cancelled"
        | "payment_unresolved" | "reservation_finalized";
};
export interface InventoryReservationReleaseV2Repository {
    releaseCancelledOrderReservation: (reservationId: EntityId) => Promise<ReservationReleaseOutcome>;
}
export type ReservationReleaseResult = ReservationReleaseOutcome
    | { kind: "invalid_reservation_input" | "inventory_unavailable" };

/** Internal cancellation transition; does not credit stock because it was never deducted. */
export class InventoryReservationReleaseV2Service {
    constructor(private readonly dependencies: { repository: InventoryReservationReleaseV2Repository }) {}

    async releaseCancelled(reservationIdInput: unknown): Promise<ReservationReleaseResult> {
        let reservationId: EntityId;
        try { reservationId = serializeEntityId(reservationIdInput); }
        catch { return { kind: "invalid_reservation_input" }; }
        try { return await this.dependencies.repository.releaseCancelledOrderReservation(reservationId); }
        catch { return { kind: "inventory_unavailable" }; }
    }
}
