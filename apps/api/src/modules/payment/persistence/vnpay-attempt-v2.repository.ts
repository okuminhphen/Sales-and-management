import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type Money } from "../../../shared/contracts/database-scalars.js";
import type {
    ReserveVnPayAttempt, VnPayAttemptV2Repository, VnPayAttemptV2Result,
} from "../application/vnpay-attempt-v2.service.js";

type OrderRow = { customerId: unknown | null; branchId: unknown; channel: string; status: string;
    fulfillmentStatus: string; totalAmount: string };
type PaymentRow = { id: unknown; merchantReference: string; amount: string; status: string;
    provider: string; methodId: unknown };
const scaled = (value: string): bigint => BigInt(serializeMoney(value).replace(".", ""));
const moneyFromScaled = (value: bigint): Money => {
    const digits = value.toString().padStart(5, "0");
    return serializeMoney(`${digits.slice(0, -4)}.${digits.slice(-4)}`);
};

/** Owns order -> payment locks and commits the intent before any provider call. */
export class SequelizeVnPayAttemptV2Repository implements VnPayAttemptV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    reserve(input: ReserveVnPayAttempt): Promise<VnPayAttemptV2Result> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.reserveLocked(input, transaction)));
    }

    private async reserveLocked(input: ReserveVnPayAttempt, transaction: Transaction): Promise<VnPayAttemptV2Result> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<OrderRow>(
            `SELECT customer_id AS customerId, fulfillment_branch_id AS branchId, channel, status,
                    fulfillment_status AS fulfillmentStatus, total_amount AS totalAmount
             FROM orders WHERE id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order || order.customerId === null
            || serializeDatabaseEntityId(order.customerId) !== input.customerId || order.channel !== "online") {
            return { kind: "forbidden" };
        }
        if (order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled") {
            return { kind: "order_not_payable" };
        }
        const method = (await sql.query<{ id: unknown; isActive: boolean | number | string }>(
            "SELECT id, is_active AS isActive FROM payment_methods WHERE code = 'VNPAY' FOR SHARE",
            { transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!method) return { kind: "payment_unavailable" };
        const methodId = serializeDatabaseEntityId(method.id);
        const merchantReference = `vnpay:${input.orderId}:${input.requestKey}`;
        const payments = await sql.query<PaymentRow>(
            `SELECT id, payment_method_id AS methodId, provider, merchant_reference AS merchantReference,
                    amount, status FROM payments WHERE order_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [input.orderId], transaction, type: QueryTypes.SELECT },
        );
        const existing = payments.find((payment) => payment.merchantReference === merchantReference);
        if (existing) {
            if (existing.provider !== "vnpay" || serializeDatabaseEntityId(existing.methodId) !== methodId) {
                return { kind: "payment_unavailable" };
            }
            return { kind: "replayed", paymentId: serializeDatabaseEntityId(existing.id), merchantReference,
                amount: serializeMoney(existing.amount), status: existing.status as Extract<VnPayAttemptV2Result,
                    { kind: "created" | "replayed" }>["status"] };
        }
        if (!(method.isActive === true || method.isActive === 1 || method.isActive === "1")) {
            return { kind: "payment_unavailable" };
        }
        const total = scaled(order.totalAmount);
        const committed = payments.reduce((sum, payment) => sum +
            (["pending", "processing", "completed"].includes(payment.status) ? scaled(payment.amount) : 0n), 0n);
        if (committed > total) throw new Error("Payment allocation exceeds order total.");
        const remaining = total - committed;
        if (remaining === 0n) return { kind: payments.some((payment) => payment.status === "pending"
            || payment.status === "processing") ? "payment_in_progress" : "order_not_payable" };
        if (remaining % 10_000n !== 0n) return { kind: "payment_unavailable" };
        if (!await this.hasPayableHolds(input.orderId, serializeDatabaseEntityId(order.branchId), transaction)) {
            return { kind: "order_not_payable" };
        }
        const amount = moneyFromScaled(remaining);
        const [id] = await sql.query(
            `INSERT INTO payments (order_id, payment_method_id, collected_by_account_id,
                provider, merchant_reference, amount, status, created_at, updated_at)
             VALUES (?, ?, NULL, 'vnpay', ?, ?, 'pending', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [input.orderId, methodId, merchantReference, amount],
                transaction, type: QueryTypes.INSERT },
        );
        return { kind: "created", paymentId: serializeDatabaseEntityId(id), merchantReference,
            amount, status: "pending" };
    }

    private async hasPayableHolds(orderId: string, branchId: string, transaction: Transaction): Promise<boolean> {
        const sql = this.persistence.sequelize;
        const items = await sql.query<{ id: unknown; variantId: unknown | null; quantity: number }>(
            `SELECT id, product_variant_id AS variantId, quantity FROM order_items
             WHERE order_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        if (items.length === 0 || items.some((item) => item.variantId === null
            || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) return false;
        const variantIds = items.map((item) => serializeDatabaseEntityId(item.variantId));
        const inventoryRows = await sql.query<{ id: unknown; variantId: unknown }>(
            `SELECT id, product_variant_id AS variantId FROM inventories
             WHERE branch_id = ? AND product_variant_id IN (${variantIds.map(() => "?").join(", ")})
             ORDER BY id ASC FOR UPDATE`,
            { replacements: [branchId, ...variantIds], transaction, type: QueryTypes.SELECT },
        );
        const inventoryByVariant = new Map(inventoryRows.map((row) =>
            [serializeDatabaseEntityId(row.variantId), serializeDatabaseEntityId(row.id)]));
        if (inventoryByVariant.size !== new Set(variantIds).size) return false;
        const itemIds = items.map((item) => serializeDatabaseEntityId(item.id));
        const holds = await sql.query<{ itemId: unknown; inventoryId: unknown; quantity: number;
            status: string; confirmedAt: Date | null; expiresAt: Date | null; unexpired: number | string }>(
            `SELECT order_item_id AS itemId, inventory_id AS inventoryId, quantity, status,
                    confirmed_at AS confirmedAt, expires_at AS expiresAt,
                    (expires_at > CURRENT_TIMESTAMP(3)) AS unexpired
             FROM inventory_reservations WHERE order_item_id IN (${itemIds.map(() => "?").join(", ")})
             ORDER BY inventory_id ASC, id ASC FOR UPDATE`,
            { replacements: itemIds, transaction, type: QueryTypes.SELECT },
        );
        if (holds.length !== items.length) return false;
        const holdByItem = new Map(holds.map((hold) => [serializeDatabaseEntityId(hold.itemId), hold]));
        return holdByItem.size === items.length && items.every((item) => {
            const hold = holdByItem.get(serializeDatabaseEntityId(item.id));
            const expectedInventoryId = inventoryByVariant.get(serializeDatabaseEntityId(item.variantId));
            return hold !== undefined && expectedInventoryId !== undefined
                && serializeDatabaseEntityId(hold.inventoryId) === expectedInventoryId
                && hold.quantity === item.quantity && hold.status === "active"
                && hold.confirmedAt === null && hold.expiresAt !== null
                && (hold.unexpired === 1 || hold.unexpired === "1");
        });
    }
}
