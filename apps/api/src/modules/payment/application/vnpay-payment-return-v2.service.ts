import type { VnPayGatewayPort } from "./vnpay-gateway.port.js";

export type VnPayPaymentReturnV2Result =
    | { kind: "awaiting_confirmation" | "payment_failed" }
    | { kind: "invalid_callback" };

/**
 * Browser return is deliberately presentation-only. VNPay IPN is the sole
 * path that persists provider events, so closing or replaying a browser does
 * not change payment state.
 */
export class VnPayPaymentReturnV2Service {
    constructor(private readonly dependencies: { gateway: Pick<VnPayGatewayPort, "verifyCallback"> }) {}

    handle(payload: Readonly<Record<string, string>>): VnPayPaymentReturnV2Result {
        const callback = this.dependencies.gateway.verifyCallback(payload);
        if (callback.kind === "invalid") return { kind: "invalid_callback" };
        return callback.outcome === "completed"
            ? { kind: "awaiting_confirmation" }
            : { kind: "payment_failed" };
    }
}
