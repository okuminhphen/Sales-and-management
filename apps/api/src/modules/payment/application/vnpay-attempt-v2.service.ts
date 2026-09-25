import { serializeEntityId, type EntityId, type Money } from "../../../shared/contracts/database-scalars.js";
import type { V2AccessContext } from "../../identity-access/application/access-context.js";

export type ReserveVnPayAttempt = {
    orderId: EntityId;
    customerId: EntityId;
    requestKey: string;
};
export type VnPayAttemptV2Result =
    | { kind: "created" | "replayed"; paymentId: EntityId; merchantReference: string;
        amount: Money; status: "pending" | "processing" | "completed" | "failed" | "cancelled"; createdAt: Date }
    | { kind: "forbidden" | "order_not_payable" | "payment_in_progress" | "payment_unavailable" };
export interface VnPayAttemptV2Repository {
    reserve: (input: ReserveVnPayAttempt) => Promise<VnPayAttemptV2Result>;
}
export type VnPayAttemptV2CommandResult = VnPayAttemptV2Result | { kind: "invalid_attempt" };

/** Reserves a provider attempt only. URL signing and callback handling are separate boundaries. */
export class VnPayAttemptV2Service {
    constructor(private readonly dependencies: { repository: VnPayAttemptV2Repository }) {}

    async reserve(context: V2AccessContext, input: { orderId: unknown; requestKey: unknown }):
        Promise<VnPayAttemptV2CommandResult> {
        if (!context.customerId) return { kind: "forbidden" };
        let orderId: EntityId;
        let customerId: EntityId;
        try {
            orderId = serializeEntityId(input.orderId);
            customerId = serializeEntityId(context.customerId);
        } catch { return { kind: "invalid_attempt" }; }
        if (typeof input.requestKey !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestKey)) {
            return { kind: "invalid_attempt" };
        }
        try { return await this.dependencies.repository.reserve({ orderId, customerId,
            requestKey: input.requestKey.toLowerCase() }); }
        catch { return { kind: "payment_unavailable" }; }
    }
}
