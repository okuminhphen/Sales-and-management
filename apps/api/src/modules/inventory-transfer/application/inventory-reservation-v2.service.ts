import { isRetryableV2TransactionError } from "../../../database/v2/transaction-retry.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReserveOrderItemInput = { orderItemId: EntityId; idempotencyKey: string; expiresAt: Date };
export type ReserveOrderItemResult =
    | { kind: "reserved" | "replayed"; reservationId: EntityId; quantity: number }
    | { kind: "order_item_not_reservable" | "insufficient_stock" | "already_reserved" | "idempotency_conflict" };

export interface InventoryReservationV2Repository {
    reserveOrderItem: (input: ReserveOrderItemInput) => Promise<ReserveOrderItemResult>;
}

export type InventoryReservationCommandResult = ReserveOrderItemResult
    | { kind: "invalid_reservation_input" | "inventory_unavailable" };

/** Internal checkout operation; authorization and order creation belong to the commerce use case. */
export class InventoryReservationV2Service {
    constructor(private readonly dependencies: {
        repository: InventoryReservationV2Repository;
        now?: () => Date;
    }) {}

    async reserveOrderItem(input: { orderItemId: unknown; idempotencyKey: unknown; expiresAt: unknown }): Promise<InventoryReservationCommandResult> {
        let orderItemId: EntityId;
        try { orderItemId = serializeEntityId(input.orderItemId); }
        catch { return { kind: "invalid_reservation_input" }; }
        const now = this.dependencies.now?.() ?? new Date();
        if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,191}$/.test(input.idempotencyKey)
            || !(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime())
            || input.expiresAt.getTime() <= now.getTime()) return { kind: "invalid_reservation_input" };
        // MySQL TIMESTAMP has second precision in this schema; normalize once so
        // an identical retry compares the same expiry value after round-trip.
        const expiresAt = new Date(Math.floor(input.expiresAt.getTime() / 1000) * 1000);
        if (expiresAt.getTime() <= now.getTime()) return { kind: "invalid_reservation_input" };
        try {
            return await this.dependencies.repository.reserveOrderItem({
                orderItemId, idempotencyKey: input.idempotencyKey as string, expiresAt,
            });
        } catch (error) {
            // A checkout that owns the transaction must retry from its first write.
            if (isRetryableV2TransactionError(error)) throw error;
            return { kind: "inventory_unavailable" };
        }
    }
}
