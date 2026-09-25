import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney } from "../../../shared/contracts/database-scalars.js";
import type { ApplyVnPayCallback, VnPayPaymentCallbackResult, VnPayPaymentCallbackV2Repository } from "../application/vnpay-payment-callback-v2.service.js";

type PaymentLocatorRow = { orderId: unknown };
type OrderRow = { id: unknown; currency: string };
type PaymentRow = { id: unknown; orderId: unknown; provider: string; merchantReference: string;
    providerTransactionId: string | null; amount: string; status: string };
type PaymentEventRow = { paymentId: unknown };

/**
 * Writes only verified provider facts. It locks `order -> payment` to match checkout,
 * creates one idempotent event, and prevents completed payments from regressing.
 */
export class SequelizeVnPayPaymentCallbackV2Repository implements VnPayPaymentCallbackV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    apply(callback: ApplyVnPayCallback): Promise<VnPayPaymentCallbackResult> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.applyLocked(callback, transaction)));
    }

    private async applyLocked(callback: ApplyVnPayCallback, transaction: Transaction): Promise<VnPayPaymentCallbackResult> {
        const sql = this.persistence.sequelize;
        // The immutable payment -> order FK lets us discover the parent before acquiring
        // locks in the global order -> payment sequence used by checkout and cancellation.
        const locator = (await sql.query<PaymentLocatorRow>(
            "SELECT order_id AS orderId FROM payments WHERE id = ?",
            { replacements: [callback.paymentId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!locator) return { kind: "payment_not_found", paymentId: callback.paymentId };
        const order = (await sql.query<OrderRow>(
            "SELECT id, currency FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [locator.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order) throw new Error("Payment references a missing order.");
        const payment = (await sql.query<PaymentRow>(
            `SELECT id, order_id AS orderId, provider, merchant_reference AS merchantReference,
                    provider_transaction_id AS providerTransactionId, amount, status
             FROM payments WHERE id = ? FOR UPDATE`,
            { replacements: [callback.paymentId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!payment || serializeDatabaseEntityId(payment.orderId) !== serializeDatabaseEntityId(order.id)) {
            throw new Error("Payment changed while its order was locked.");
        }
        const paymentId = serializeDatabaseEntityId(payment.id);
        if (payment.provider !== "vnpay" || callback.transactionReference !== `V2${paymentId}`
            || !payment.merchantReference.startsWith("vnpay:")) {
            return { kind: "payment_mismatch", paymentId };
        }
        if (order.currency !== "VND" || serializeMoney(payment.amount) !== callback.amount) {
            return { kind: "amount_mismatch", paymentId };
        }
        const existingEvent = (await sql.query<PaymentEventRow>(
            "SELECT payment_id AS paymentId FROM payment_events WHERE provider = 'vnpay' AND event_key = ? FOR UPDATE",
            { replacements: [callback.eventKey], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (existingEvent) {
            if (serializeDatabaseEntityId(existingEvent.paymentId) !== paymentId) {
                return { kind: "provider_event_conflict", paymentId };
            }
            if (payment.status !== "completed" && payment.status !== "failed") {
                throw new Error("Processed payment event has a non-terminal payment status.");
            }
            return { kind: "replayed", paymentId, status: payment.status };
        }
        if (payment.providerTransactionId && callback.providerTransactionId
            && payment.providerTransactionId !== callback.providerTransactionId) {
            return { kind: "provider_transaction_conflict", paymentId };
        }
        if (callback.providerTransactionId) {
            const transactionOwner = (await sql.query<{ id: unknown }>(
                "SELECT id FROM payments WHERE provider = 'vnpay' AND provider_transaction_id = ? FOR UPDATE",
                { replacements: [callback.providerTransactionId], transaction, type: QueryTypes.SELECT },
            ))[0];
            if (transactionOwner && serializeDatabaseEntityId(transactionOwner.id) !== paymentId) {
                return { kind: "provider_transaction_conflict", paymentId };
            }
        }
        if (payment.status === "completed") return { kind: "completed_conflict", paymentId };

        await sql.query(
            `UPDATE payments SET provider_transaction_id = COALESCE(?, provider_transaction_id),
                status = ?, paid_at = CASE WHEN ? = 'completed' THEN COALESCE(paid_at, UTC_TIMESTAMP(3)) ELSE paid_at END,
                updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [callback.providerTransactionId, callback.outcome, callback.outcome, paymentId], transaction },
        );
        await sql.query(
            `INSERT INTO payment_events (payment_id, provider, event_key, event_type, verified_at, processed_at, created_at)
             VALUES (?, 'vnpay', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [paymentId, callback.eventKey, `vnpay.payment.${callback.outcome}`], transaction },
        );
        return { kind: "processed", paymentId, status: callback.outcome };
    }
}
