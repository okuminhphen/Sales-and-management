import type { EntityId } from "../../../shared/contracts/database-scalars.js";

export interface InventoryReservationExpiryV2Repository {
    findNextCandidate: (afterId: EntityId | null) => Promise<EntityId | null>;
    expireCandidate: (reservationId: EntityId) => Promise<{ kind: "expired" | "skipped" }>;
}

/** One bounded candidate per call. Skipped holds remain active until payment is resolved. */
export class InventoryReservationExpiryV2Worker {
    private cursor: EntityId | null = null;

    constructor(private readonly dependencies: { repository: InventoryReservationExpiryV2Repository }) {}

    async runOnce(): Promise<boolean> {
        const candidate = await this.dependencies.repository.findNextCandidate(this.cursor);
        if (candidate === null) {
            this.cursor = null;
            return false;
        }
        this.cursor = candidate;
        return (await this.dependencies.repository.expireCandidate(candidate)).kind === "expired";
    }
}
