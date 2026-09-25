import type { EntityId } from "../../../shared/contracts/database-scalars.js";
import type { VnPayCallback, VnPayGatewayPort } from "./vnpay-gateway.port.js";

export type ApplyVnPayCallback = Extract<VnPayCallback, { kind: "verified" }>;
export type VnPayPaymentCallbackResult =
    | { kind: "processed" | "replayed"; paymentId: EntityId; status: "completed" | "failed" }
    | { kind: "invalid_callback" | "payment_not_found" | "payment_mismatch" | "amount_mismatch"
        | "provider_transaction_conflict" | "provider_event_conflict" | "completed_conflict" | "callback_unavailable"; paymentId?: EntityId };

export interface VnPayPaymentCallbackV2Repository {
    apply: (callback: ApplyVnPayCallback) => Promise<VnPayPaymentCallbackResult>;
}

/** Verifies a provider callback before allowing the payment persistence port to mutate state. */
export class VnPayPaymentCallbackV2Service {
    constructor(private readonly dependencies: {
        gateway: Pick<VnPayGatewayPort, "verifyCallback">;
        repository: VnPayPaymentCallbackV2Repository;
    }) {}

    async handle(payload: Readonly<Record<string, string>>): Promise<VnPayPaymentCallbackResult> {
        const callback = this.dependencies.gateway.verifyCallback(payload);
        if (callback.kind === "invalid") return { kind: "invalid_callback" };
        try { return await this.dependencies.repository.apply(callback); }
        catch { return { kind: "callback_unavailable" }; }
    }
}
