import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReservationConfirmationOutcome = {
    kind: "confirmed" | "replayed" | "reservation_not_found" | "order_not_confirmed" | "reservation_expired" | "reservation_finalized";
};
export interface InventoryReservationConfirmationV2Repository {
    confirmOrderReservation: (reservationId: EntityId) => Promise<ReservationConfirmationOutcome>;
}
export type ReservationConfirmationResult = ReservationConfirmationOutcome
    | { kind: "invalid_reservation_input" | "inventory_unavailable" };

/** Internal transition; caller must atomically confirm the order/payment or COD policy first. */
export class InventoryReservationConfirmationV2Service {
    constructor(private readonly dependencies: { repository: InventoryReservationConfirmationV2Repository }) {}

    async confirm(reservationIdInput: unknown): Promise<ReservationConfirmationResult> {
        let reservationId: EntityId;
        try { reservationId = serializeEntityId(reservationIdInput); }
        catch { return { kind: "invalid_reservation_input" }; }
        try { return await this.dependencies.repository.confirmOrderReservation(reservationId); }
        catch { return { kind: "inventory_unavailable" }; }
    }
}
