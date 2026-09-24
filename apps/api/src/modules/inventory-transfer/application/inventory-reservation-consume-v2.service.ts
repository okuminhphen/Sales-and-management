import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReservationConsumeOutcome =
    | { kind: "consumed" | "replayed"; balanceAfter: number }
    | { kind: "reservation_not_found" | "order_not_ready" | "hold_not_confirmed" | "reservation_finalized" | "idempotency_conflict" };
export interface InventoryReservationConsumeV2Repository {
    consumeOrderReservation: (reservationId: EntityId, operationKey: string, actorAccountId?: EntityId | null) => Promise<ReservationConsumeOutcome>;
}
export type ReservationConsumeResult = ReservationConsumeOutcome
    | { kind: "invalid_consume_input" | "inventory_unavailable" };

/** Internal handover primitive; caller must verify payment and change fulfillment in the same transaction. */
export class InventoryReservationConsumeV2Service {
    constructor(private readonly dependencies: { repository: InventoryReservationConsumeV2Repository }) {}

    async consume(reservationIdInput: unknown, operationKey: unknown, actorAccountIdInput?: unknown): Promise<ReservationConsumeResult> {
        let reservationId: EntityId;
        let actorAccountId: EntityId | null = null;
        try {
            reservationId = serializeEntityId(reservationIdInput);
            if (actorAccountIdInput !== undefined && actorAccountIdInput !== null) {
                actorAccountId = serializeEntityId(actorAccountIdInput);
            }
        } catch { return { kind: "invalid_consume_input" }; }
        if (typeof operationKey !== "string" || !/^[A-Za-z0-9._:-]{1,191}$/.test(operationKey)) {
            return { kind: "invalid_consume_input" };
        }
        try { return await this.dependencies.repository.consumeOrderReservation(reservationId, operationKey, actorAccountId); }
        catch { return { kind: "inventory_unavailable" }; }
    }
}
