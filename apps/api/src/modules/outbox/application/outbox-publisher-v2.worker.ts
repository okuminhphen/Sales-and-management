import type { EntityId } from "../../../shared/contracts/database-scalars.js";

export type OutboxV2Event = {
    eventId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    occurredAt: string;
};

export type OutboxV2Job = { id: EntityId; attempt: number; event: OutboxV2Event };

export interface OutboxPublisherV2Repository {
    claimNext: () => Promise<OutboxV2Job | null>;
    markPublished: (id: EntityId, attempt: number) => Promise<boolean>;
    markFailed: (id: EntityId, attempt: number) => Promise<boolean>;
}

export interface OutboxV2EventPublisher {
    /** Resolve only after the broker has acknowledged the persistent message. */
    publish: (event: OutboxV2Event) => Promise<void>;
}

/** At-least-once delivery. Consumers must deduplicate by eventId. */
export class OutboxPublisherV2Worker {
    constructor(private readonly dependencies: {
        repository: OutboxPublisherV2Repository;
        publisher: OutboxV2EventPublisher;
    }) {}

    async runOnce(): Promise<"idle" | "published" | "failed" | "lease_lost"> {
        const job = await this.dependencies.repository.claimNext();
        if (!job) return "idle";
        try {
            await this.dependencies.publisher.publish(job.event);
        } catch {
            return await this.dependencies.repository.markFailed(job.id, job.attempt) ? "failed" : "lease_lost";
        }
        return await this.dependencies.repository.markPublished(job.id, job.attempt) ? "published" : "lease_lost";
    }
}
