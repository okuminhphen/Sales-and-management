import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReserveTransferItemInput = { transferItemId: EntityId; idempotencyKey: string };
export type ReserveTransferItemOutcome =
    | { kind: "reserved" | "replayed"; reservationId: EntityId; quantity: number }
    | { kind: "transfer_item_not_approvable" | "insufficient_stock" | "already_reserved" | "idempotency_conflict" };
export interface InventoryTransferReservationV2Repository {
    reserveTransferItem: (input: ReserveTransferItemInput) => Promise<ReserveTransferItemOutcome>;
}
export type ReserveTransferItemResult = ReserveTransferItemOutcome
    | { kind: "invalid_reservation_input" | "inventory_unavailable" };

/** Called inside the transfer approval transaction, after its authorization and quantity checks. */
export class InventoryTransferReservationV2Service {
    constructor(private readonly dependencies: { repository: InventoryTransferReservationV2Repository }) {}

    async reserveTransferItem(input: { transferItemId: unknown; idempotencyKey: unknown }): Promise<ReserveTransferItemResult> {
        let transferItemId: EntityId;
        try { transferItemId = serializeEntityId(input.transferItemId); }
        catch { return { kind: "invalid_reservation_input" }; }
        if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,191}$/.test(input.idempotencyKey)) {
            return { kind: "invalid_reservation_input" };
        }
        try {
            return await retryV2Transaction(() => this.dependencies.repository.reserveTransferItem({
                transferItemId, idempotencyKey: input.idempotencyKey as string,
            }));
        } catch { return { kind: "inventory_unavailable" }; }
    }
}
