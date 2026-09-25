import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { SequelizeInventoryReservationV2Repository } from "../../inventory-transfer/persistence/inventory-reservation-v2.repository.js";
import { allocateOrderDiscountV2, roundCatalogUnitPriceV2 } from "../application/order-pricing-v2.js";
import type {
    PosCashCheckoutResult,
    PosCashCheckoutV2Repository,
    PreparedPosCashCheckout,
} from "../application/pos-cash-checkout-v2.service.js";

type ExistingOrder = {
    id: unknown;
    checkoutKey: string;
    accountId: unknown;
    branchId: unknown;
    channel: string;
    fulfillmentType: string;
    customerId: unknown;
    totalAmount: string;
};
type ExistingPayment = {
    methodCode: string;
    provider: string;
    status: string;
    amount: string;
    collectorAccountId: unknown;
};
type ProductRow = {
    variantId: unknown;
    productId: unknown;
    sku: string;
    productName: string;
    sizeName: string;
    basePrice: string;
    imagesText: string | null;
};
type CheckoutFailure = { kind: "product_unavailable" | "branch_unavailable" | "insufficient_stock" | "payment_method_unavailable" };

class RejectedPosCheckout extends Error {
    constructor(readonly result: CheckoutFailure) { super(result.kind); }
}

const reject = (kind: CheckoutFailure["kind"]): never => { throw new RejectedPosCheckout({ kind }); };
const sameId = (actual: unknown, expected: EntityId): boolean =>
    actual !== null && serializeDatabaseEntityId(actual) === expected;
const parseImageSnapshot = (value: string | null): unknown => value === null ? null : JSON.parse(value);

/**
 * POS cash is an atomic terminal transaction. It has no durable pending hold:
 * temporary reservations are confirmed and consumed before this transaction can
 * commit, so a crashed counter never leaves the online 15-minute hold behind.
 */
export class SequelizePosCashCheckoutV2Repository implements PosCashCheckoutV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async checkoutCashCarryOut(input: PreparedPosCashCheckout): Promise<PosCashCheckoutResult> {
        // Access context is refreshed per HTTP request, but recheck the mutable
        // staff assignment here so a deactivation/branch move cannot race a POS write or replay.
        if (!await this.isActiveStaffAtBranch(input)) return { kind: "checkout_unavailable" };
        const existing = await this.replay(input);
        if (existing) return existing;
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.createLocked(input, transaction)));
        } catch (error) {
            if (error instanceof RejectedPosCheckout) return error.result;
            if ((error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                const winner = await this.replay(input);
                if (winner) return winner;
            }
            throw error;
        }
    }

    private async isActiveStaffAtBranch(input: PreparedPosCashCheckout): Promise<boolean> {
        const rows = await this.persistence.sequelize.query<{ id: unknown }>(
            `SELECT e.id FROM employees e JOIN accounts a ON a.id = e.account_id
             WHERE e.id = ? AND e.account_id = ? AND e.branch_id = ?
               AND e.status = 'active' AND a.status = 'active'`,
            { replacements: [input.employeeId, input.accountId, input.branchId], type: QueryTypes.SELECT },
        );
        return rows.length === 1;
    }

    private async replay(input: PreparedPosCashCheckout): Promise<PosCashCheckoutResult | null> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<ExistingOrder>(
            `SELECT id, checkout_key AS checkoutKey, created_by_account_id AS accountId,
                    fulfillment_branch_id AS branchId, channel, fulfillment_type AS fulfillmentType,
                    customer_id AS customerId, total_amount AS totalAmount
             FROM orders WHERE checkout_key = ?`,
            { replacements: [input.checkoutKey], type: QueryTypes.SELECT },
        ))[0];
        if (!order) return null;
        const conflict = { kind: "idempotency_conflict" } as const;
        if (order.checkoutKey !== input.checkoutKey || !sameId(order.accountId, input.accountId)
            || !sameId(order.branchId, input.branchId) || order.customerId !== null
            || order.channel !== "in_store" || order.fulfillmentType !== "carry_out") return conflict;
        const orderId = serializeDatabaseEntityId(order.id);
        const items = await sql.query<{ variantId: unknown; quantity: unknown }>(
            "SELECT product_variant_id AS variantId, quantity FROM order_items WHERE order_id = ? ORDER BY product_variant_id ASC",
            { replacements: [orderId], type: QueryTypes.SELECT },
        );
        if (items.length !== input.items.length || items.some((item, index) =>
            !sameId(item.variantId, input.items[index]!.variantId) || Number(item.quantity) !== input.items[index]!.quantity)) {
            return conflict;
        }
        const totalAmount = serializeMoney(order.totalAmount);
        const payments = await sql.query<ExistingPayment>(
            `SELECT pm.code AS methodCode, p.provider, p.status, p.amount,
                    p.collected_by_account_id AS collectorAccountId
             FROM payments p JOIN payment_methods pm ON pm.id = p.payment_method_id
             WHERE p.order_id = ? ORDER BY p.id ASC`,
            { replacements: [orderId], type: QueryTypes.SELECT },
        );
        if (totalAmount === "0.0000") return payments.length === 0 ? { kind: "replayed", orderId } : conflict;
        const payment = payments[0];
        if (payments.length !== 1 || !payment || payment.methodCode !== "CASH" || payment.provider !== "cash"
            || payment.status !== "completed" || payment.amount !== totalAmount
            || !sameId(payment.collectorAccountId, input.accountId)) return conflict;
        return { kind: "replayed", orderId };
    }

    private async createLocked(input: PreparedPosCashCheckout, transaction: Transaction): Promise<PosCashCheckoutResult> {
        const sql = this.persistence.sequelize;
        const staff = await sql.query<{ id: unknown }>(
            `SELECT e.id FROM employees e JOIN accounts a ON a.id = e.account_id
             WHERE e.id = ? AND e.account_id = ? AND e.branch_id = ?
               AND e.status = 'active' AND a.status = 'active' FOR UPDATE`,
            { replacements: [input.employeeId, input.accountId, input.branchId], transaction, type: QueryTypes.SELECT },
        );
        if (!staff[0]) return { kind: "checkout_unavailable" };
        const branch = await sql.query<{ id: unknown }>("SELECT id FROM branches WHERE id = ? FOR UPDATE",
            { replacements: [input.branchId], transaction, type: QueryTypes.SELECT });
        if (!branch[0]) reject("branch_unavailable");

        const placeholders = input.items.map(() => "?").join(", ");
        const products = await sql.query<ProductRow>(
            `SELECT pv.id AS variantId, p.id AS productId, pv.sku, p.name AS productName,
                    s.name AS sizeName, p.base_price AS basePrice, CAST(p.images AS CHAR) AS imagesText
             FROM product_variants pv JOIN products p ON p.id = pv.product_id
             JOIN sizes s ON s.id = pv.size_id
             WHERE pv.id IN (${placeholders}) AND pv.status = 'active' AND p.status = 'active'`,
            { replacements: input.items.map((item) => item.variantId), transaction, type: QueryTypes.SELECT },
        );
        if (products.length !== input.items.length) reject("product_unavailable");
        const productsByVariant = new Map(products.map((product) => [serializeDatabaseEntityId(product.variantId), product]));
        const orderedProducts = input.items.map((item) => productsByVariant.get(item.variantId));
        if (orderedProducts.some((product) => !product)) reject("product_unavailable");
        const amounts = allocateOrderDiscountV2(input.items.map((item, index) => ({
            unitPrice: orderedProducts[index]!.basePrice, quantity: item.quantity,
        })), "0.0000");

        let cashMethodId: EntityId | null = null;
        if (amounts.totalAmount !== "0.0000") {
            const method = await sql.query<{ id: unknown }>(
                "SELECT id FROM payment_methods WHERE code = 'CASH' AND is_active = TRUE FOR UPDATE",
                { transaction, type: QueryTypes.SELECT },
            );
            if (!method[0]) reject("payment_method_unavailable");
            cashMethodId = serializeDatabaseEntityId(method[0].id);
        }

        const [createdId] = await sql.query(
            `INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id,
                created_by_account_id, channel, fulfillment_type, fulfillment_status, status,
                currency, subtotal_amount, discount_amount, shipping_fee, total_amount, placed_at,
                created_at, updated_at)
             VALUES (?, ?, NULL, ?, ?, 'in_store', 'carry_out', 'unfulfilled', 'pending',
                'VND', ?, '0.0000', '0.0000', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [`O-${randomUUID()}`, input.checkoutKey, input.branchId, input.accountId,
                amounts.subtotalAmount, amounts.totalAmount], transaction, type: QueryTypes.INSERT },
        );
        const orderId = serializeDatabaseEntityId(createdId);
        const orderItems = new Map<EntityId, EntityId>();
        for (const [index, item] of input.items.entries()) {
            const product = orderedProducts[index]!;
            const [createdItemId] = await sql.query(
                `INSERT INTO order_items (order_id, product_id, product_variant_id, sku_snapshot,
                    product_name_snapshot, size_name_snapshot, image_snapshot, unit_price,
                    discount_amount, quantity, line_total, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, '0.0000', ?, ?, UTC_TIMESTAMP(3))`,
                { replacements: [orderId, product.productId, item.variantId, product.sku,
                    product.productName, product.sizeName, parseImageSnapshot(product.imagesText),
                    roundCatalogUnitPriceV2(product.basePrice), item.quantity, amounts.lines[index]!.lineTotal],
                transaction, type: QueryTypes.INSERT },
            );
            orderItems.set(item.variantId, serializeDatabaseEntityId(createdItemId));
        }
        await this.insertHistory(transaction, orderId, null, "pending", null, "unfulfilled", input.accountId);

        // Resolve inventory order before the primitive locks it, matching the lock order of online checkout.
        const inventories = await sql.query<{ id: unknown; variantId: unknown }>(
            `SELECT id, product_variant_id AS variantId FROM inventories
             WHERE branch_id = ? AND product_variant_id IN (${placeholders}) ORDER BY id ASC`,
            { replacements: [input.branchId, ...input.items.map((item) => item.variantId)], transaction, type: QueryTypes.SELECT },
        );
        if (inventories.length !== input.items.length) reject("insufficient_stock");
        const reservationRepository = new SequelizeInventoryReservationV2Repository(this.persistence, transaction);
        const expiration = new Date(Math.floor(input.reservationExpiresAt.getTime() / 1000) * 1000);
        const reservations: EntityId[] = [];
        for (const inventory of inventories) {
            const variantId = serializeDatabaseEntityId(inventory.variantId);
            const orderItemId = orderItems.get(variantId);
            if (!orderItemId) throw new Error("Inventory variant does not match POS checkout item.");
            const reservation = await reservationRepository.reserveOrderItem({ orderItemId,
                idempotencyKey: `${input.checkoutKey}:item:${orderItemId}`, expiresAt: expiration });
            if (reservation.kind === "insufficient_stock") reject("insufficient_stock");
            if (reservation.kind !== "reserved") throw new Error(`POS checkout hold failed: ${reservation.kind}`);
            reservations.push(reservation.reservationId);
        }

        if (cashMethodId !== null) {
            await sql.query(
                `INSERT INTO payments (order_id, payment_method_id, collected_by_account_id, provider,
                    merchant_reference, amount, status, paid_at, created_at, updated_at)
                 VALUES (?, ?, ?, 'cash', ?, ?, 'completed', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                { replacements: [orderId, cashMethodId, input.accountId, `POS-CASH:${input.checkoutKey}`,
                    amounts.totalAmount], transaction, type: QueryTypes.INSERT },
            );
        }

        await sql.query("UPDATE orders SET status = 'confirmed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [orderId], transaction });
        await this.insertHistory(transaction, orderId, "pending", "confirmed", "unfulfilled", "unfulfilled", input.accountId);
        for (const reservationId of reservations) {
            const confirmation = await reservationRepository.confirmOrderReservation(reservationId);
            if (confirmation.kind !== "confirmed") throw new Error(`POS checkout confirmation failed: ${confirmation.kind}`);
        }
        await sql.query(
            `UPDATE orders SET status = 'completed', fulfillment_status = 'fulfilled', fulfilled_at = UTC_TIMESTAMP(3),
                updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
            { replacements: [orderId], transaction },
        );
        await this.insertHistory(transaction, orderId, "confirmed", "completed", "unfulfilled", "fulfilled", input.accountId);
        for (const reservationId of reservations) {
            const consumption = await reservationRepository.consumeOrderReservation(
                reservationId, `${input.checkoutKey}:consume:${reservationId}`, input.accountId);
            if (consumption.kind !== "consumed") throw new Error(`POS checkout consumption failed: ${consumption.kind}`);
        }

        await sql.query(
            `INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id, payload,
                occurred_at, created_at, updated_at)
             VALUES (?, 'commerce.order.created', 'order', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
                    (?, 'commerce.order.confirmed', 'order', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [randomUUID(), orderId, JSON.stringify({ orderId, customerId: null,
                branchId: input.branchId, channel: "in_store", fulfillmentType: "carry_out" }),
            randomUUID(), orderId, JSON.stringify({ orderId, branchId: input.branchId, channel: "in_store",
                fulfillmentType: "carry_out", paymentProvider: cashMethodId === null ? null : "cash" })], transaction },
        );
        return { kind: "created", orderId };
    }

    private async insertHistory(
        transaction: Transaction,
        orderId: EntityId,
        fromStatus: "pending" | "confirmed" | "completed" | "cancelled" | null,
        toStatus: "pending" | "confirmed" | "completed" | "cancelled",
        fromFulfillmentStatus: "unfulfilled" | "preparing" | "ready_for_pickup" | "shipping" | "fulfilled" | "exception" | "cancelled" | null,
        toFulfillmentStatus: "unfulfilled" | "preparing" | "ready_for_pickup" | "shipping" | "fulfilled" | "exception" | "cancelled",
        actorAccountId: EntityId,
    ): Promise<void> {
        await this.persistence.sequelize.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status, from_fulfillment_status,
                to_fulfillment_status, changed_by_account_id, changed_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
            { replacements: [orderId, fromStatus, toStatus, fromFulfillmentStatus, toFulfillmentStatus,
                actorAccountId], transaction },
        );
    }
}
