import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { OutboxPublisherV2Repository, OutboxV2Event, OutboxV2Job } from "../application/outbox-publisher-v2.worker.js";

/** Internal cleanup/reservation rows are not RabbitMQ domain events. */
export const PUBLISHABLE_V2_EVENT_TYPES = [
    "catalog.product.upserted", "catalog.product.deleted",
    "commerce.order.created", "commerce.order.confirmed", "commerce.order.cancelled",
] as const;

type OutboxRow = { id: unknown; eventId: string; eventType: string; aggregateType: string;
    aggregateId: string; payload: unknown; occurredAt: Date | string; attempts: number };

const toPayload = (value: unknown): Record<string, unknown> => {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Outbox payload must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
};

/** MySQL claim lease uses attempts as a fencing token after stale lease reclaim. */
export class SequelizeOutboxPublisherV2Repository implements OutboxPublisherV2Repository {
    constructor(private readonly persistence: V2Persistence,
        private readonly eventTypes: readonly string[] = PUBLISHABLE_V2_EVENT_TYPES) {
        if (eventTypes.length === 0 || eventTypes.some((type) => !/^[a-z][a-z0-9_.-]{1,99}$/.test(type))) {
            throw new TypeError("Invalid publishable outbox event types.");
        }
    }

    async claimNext(): Promise<OutboxV2Job | null> {
        return this.persistence.inTransaction(async (transaction) => {
            const placeholders = this.eventTypes.map(() => "?").join(", ");
            const rows = await this.persistence.sequelize.query<OutboxRow>(
                `SELECT id, event_id AS eventId, event_type AS eventType,
                        aggregate_type AS aggregateType, aggregate_id AS aggregateId,
                        payload, occurred_at AS occurredAt, attempts
                 FROM outbox_events
                 WHERE published_at IS NULL AND attempts < 20
                   AND (locked_at IS NULL OR locked_at < UTC_TIMESTAMP(3) - INTERVAL 60 SECOND)
                   AND event_type IN (${placeholders})
                 ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
                { replacements: [...this.eventTypes], transaction, type: QueryTypes.SELECT },
            );
            const row = rows[0];
            if (!row) return null;
            const id = serializeDatabaseEntityId(row.id);
            const attempt = Number(row.attempts) + 1;
            if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 20) {
                throw new Error("Invalid outbox attempt count.");
            }
            let event: OutboxV2Event;
            try {
                event = {
                    eventId: row.eventId, eventType: row.eventType, aggregateType: row.aggregateType,
                    aggregateId: row.aggregateId, payload: toPayload(row.payload),
                    occurredAt: new Date(row.occurredAt).toISOString(),
                };
            } catch {
                // A malformed committed row must not poison every subsequent batch.
                await this.persistence.sequelize.query(
                    `UPDATE outbox_events SET attempts = 20, locked_at = NULL,
                        last_error = 'invalid_event_payload', updated_at = UTC_TIMESTAMP(3)
                     WHERE id = ?`,
                    { replacements: [id], transaction },
                );
                return null;
            }
            await this.persistence.sequelize.query(
                `UPDATE outbox_events SET attempts = ?, locked_at = UTC_TIMESTAMP(3),
                    updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
                { replacements: [attempt, id], transaction },
            );
            return { id, attempt, event };
        });
    }

    async markPublished(id: EntityId, attempt: number): Promise<boolean> {
        const updated = await this.persistence.sequelize.query(
            `UPDATE outbox_events SET published_at = UTC_TIMESTAMP(3), locked_at = NULL,
                last_error = NULL, updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND attempts = ? AND locked_at IS NOT NULL AND published_at IS NULL`,
            { replacements: [id, attempt], type: QueryTypes.BULKUPDATE },
        );
        return updated === 1;
    }

    async markFailed(id: EntityId, attempt: number): Promise<boolean> {
        const updated = await this.persistence.sequelize.query(
            `UPDATE outbox_events SET last_error = 'broker_publish_failed', updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND attempts = ? AND locked_at IS NOT NULL AND published_at IS NULL`,
            { replacements: [id, attempt], type: QueryTypes.BULKUPDATE },
        );
        return updated === 1;
    }
}
