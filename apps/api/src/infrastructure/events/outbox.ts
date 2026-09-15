import { randomUUID } from "node:crypto";
import type { Transaction } from "sequelize";
import db from "../../models/index.js";

export type DomainEventType = "catalog.product.upserted" | "catalog.product.deleted";

export const enqueueOutboxEvent = async (input: {
    eventType: DomainEventType;
    aggregateType: "product";
    aggregateId: string | number;
    payload: Record<string, unknown>;
    transaction: Transaction;
}): Promise<string> => {
    const eventId = randomUUID();
    await db.OutboxEvent.create(
        {
            eventId,
            eventType: input.eventType,
            aggregateType: input.aggregateType,
            aggregateId: String(input.aggregateId),
            payload: input.payload,
            occurredAt: new Date(),
        },
        { transaction: input.transaction }
    );
    return eventId;
};

export const recordInventoryMovement = async (input: {
    branchId: number;
    productSizeId: number;
    quantityDelta: number;
    balanceAfter: number;
    reason: "ORDER_CREATED" | "TRANSFER_OUT" | "TRANSFER_IN";
    referenceType: "order" | "transfer_receipt";
    referenceId: string | number;
    idempotencyKey: string;
    createdBy?: number;
    transaction: Transaction;
}): Promise<void> => {
    await db.InventoryMovement.create(
        { ...input, referenceId: String(input.referenceId), occurredAt: new Date() },
        { transaction: input.transaction }
    );
};
