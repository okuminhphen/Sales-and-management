import { randomUUID } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { InventoryReservationV2Service } from "../../inventory-transfer/application/inventory-reservation-v2.service.js";
import { SequelizeInventoryReservationV2Repository } from "../../inventory-transfer/persistence/inventory-reservation-v2.repository.js";
import { allocateOrderDiscountV2, roundCatalogUnitPriceV2 } from "../application/order-pricing-v2.js";
import { calculateVoucherDiscountV2 } from "../application/voucher-pricing-v2.js";
import type {
    OrderCheckoutV2Repository, OnlinePickupCheckoutResult, PreparedOnlinePickupCheckout,
} from "../application/order-checkout-v2.service.js";
import { SequelizeVoucherClaimV2Repository } from "./voucher-claim-v2.repository.js";

type ExistingOrder = {
    id: unknown; checkoutKey: string; accountId: unknown; customerId: unknown; branchId: unknown;
    channel: string; fulfillmentType: string; recipientName: string | null;
    recipientPhone: string | null;
};
type ProductRow = {
    variantId: unknown; productId: unknown; sku: string; productName: string;
    sizeName: string; basePrice: string; imagesText: string | null;
};
type VoucherQuote = { discountType: "fixed" | "percent"; discountValue: string; maxDiscountAmount: string | null };
type CartItemRow = { id: unknown; variantId: unknown; quantity: number };
type CheckoutFailure = { kind: "product_unavailable" | "branch_unavailable"
    | "insufficient_stock" | "voucher_not_eligible" };

class RejectedCheckout extends Error {
    constructor(readonly result: CheckoutFailure) { super(result.kind); }
}
const reject = (kind: CheckoutFailure["kind"]): never => { throw new RejectedCheckout({ kind }); };
const sameId = (actual: unknown, expected: EntityId): boolean =>
    actual !== null && serializeDatabaseEntityId(actual) === expected;
const parseImageSnapshot = (value: string | null): unknown => value === null ? null : JSON.parse(value);

/** Owns the outer transaction; no provider calls or HTTP side effects occur under row locks. */
export class SequelizeOrderCheckoutV2Repository implements OrderCheckoutV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async checkoutOnlinePickup(input: PreparedOnlinePickupCheckout): Promise<OnlinePickupCheckoutResult> {
        const existing = await this.replay(input);
        if (existing) return existing;
        try {
            return await retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
                this.createLocked(input, transaction)));
        } catch (error) {
            if (error instanceof RejectedCheckout) return error.result;
            if ((error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                const winner = await this.replay(input);
                if (winner) return winner;
            }
            throw error;
        }
    }

    private async replay(input: PreparedOnlinePickupCheckout): Promise<OnlinePickupCheckoutResult | null> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<ExistingOrder>(
            `SELECT id, checkout_key AS checkoutKey, created_by_account_id AS accountId, customer_id AS customerId,
                    fulfillment_branch_id AS branchId, channel, fulfillment_type AS fulfillmentType,
                    customer_name AS recipientName, customer_phone AS recipientPhone
             FROM orders WHERE checkout_key = ?`,
            { replacements: [input.checkoutKey], type: QueryTypes.SELECT },
        ))[0];
        if (!order) return null;
        const conflict = { kind: "idempotency_conflict" } as const;
        if (order.checkoutKey !== input.checkoutKey || !sameId(order.accountId, input.accountId)
            || !sameId(order.customerId, input.customerId)
            || !sameId(order.branchId, input.branchId) || order.channel !== "online"
            || order.fulfillmentType !== "store_pickup" || order.recipientName !== input.recipientName
            || order.recipientPhone !== input.recipientPhone) return conflict;
        const orderId = serializeDatabaseEntityId(order.id);
        const items = await sql.query<{ variantId: unknown; quantity: number }>(
            "SELECT product_variant_id AS variantId, quantity FROM order_items WHERE order_id = ? ORDER BY product_variant_id ASC",
            { replacements: [orderId], type: QueryTypes.SELECT },
        );
        if (items.length !== input.items.length || items.some((item, index) =>
            !sameId(item.variantId, input.items[index]!.variantId)
            || Number(item.quantity) !== input.items[index]!.quantity)) return conflict;
        const redemption = (await sql.query<{ code: string }>(
            "SELECT voucher_code_snapshot AS code FROM voucher_redemptions WHERE order_id = ?",
            { replacements: [orderId], type: QueryTypes.SELECT },
        ))[0];
        if ((redemption?.code.toUpperCase() ?? null) !== input.voucherCode) return conflict;
        return { kind: "replayed", orderId };
    }

    private async createLocked(input: PreparedOnlinePickupCheckout, transaction: Transaction): Promise<OnlinePickupCheckoutResult> {
        const sql = this.persistence.sequelize;
        const customer = await sql.query<{ id: unknown }>(
            `SELECT c.id FROM customers c JOIN accounts a ON a.id = c.account_id
             WHERE c.id = ? AND a.id = ? AND c.status = 'active' AND a.status = 'active' FOR UPDATE`,
            { replacements: [input.customerId, input.accountId], transaction, type: QueryTypes.SELECT },
        );
        if (!customer[0]) return { kind: "checkout_unavailable" };
        const branch = await sql.query<{ id: unknown }>("SELECT id FROM branches WHERE id = ?",
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
        const byVariant = new Map(products.map((product) => [serializeDatabaseEntityId(product.variantId), product]));
        const ordered = input.items.map((item) => byVariant.get(item.variantId));
        if (ordered.some((product) => !product)) reject("product_unavailable");
        const priced = input.items.map((item, index) => ({ unitPrice: ordered[index]!.basePrice, quantity: item.quantity }));
        const gross = allocateOrderDiscountV2(priced, "0.0000");
        let discount = "0.0000";
        if (input.voucherCode !== null) {
            const voucher = (await sql.query<VoucherQuote>(
                `SELECT discount_type AS discountType, discount_value AS discountValue,
                        max_discount_amount AS maxDiscountAmount FROM vouchers WHERE code = ?`,
                { replacements: [input.voucherCode], transaction, type: QueryTypes.SELECT },
            ))[0];
            if (!voucher) reject("voucher_not_eligible");
            try { discount = calculateVoucherDiscountV2({ subtotal: gross.subtotalAmount, ...voucher }); }
            catch { reject("voucher_not_eligible"); }
        }
        const amounts = allocateOrderDiscountV2(priced, discount);
        const code = `O-${randomUUID()}`;
        const [createdId] = await sql.query(
            `INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id,
                created_by_account_id, channel, fulfillment_type, fulfillment_status, status,
                currency, subtotal_amount, discount_amount, shipping_fee, total_amount,
                customer_name, customer_phone, placed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'online', 'store_pickup', 'unfulfilled', 'pending',
                'VND', ?, ?, '0.0000', ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [code, input.checkoutKey, input.customerId, input.branchId, input.accountId,
                amounts.subtotalAmount, amounts.discountAmount, amounts.totalAmount,
                input.recipientName, input.recipientPhone], transaction, type: QueryTypes.INSERT },
        );
        const orderId = serializeDatabaseEntityId(createdId);
        const itemIds = new Map<EntityId, EntityId>();
        for (const [index, item] of input.items.entries()) {
            const product = ordered[index]!;
            const [itemId] = await sql.query(
                `INSERT INTO order_items (order_id, product_id, product_variant_id, sku_snapshot,
                    product_name_snapshot, size_name_snapshot, image_snapshot, unit_price,
                    discount_amount, quantity, line_total, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
                { replacements: [orderId, product.productId, item.variantId, product.sku,
                    product.productName, product.sizeName, parseImageSnapshot(product.imagesText),
                    roundCatalogUnitPriceV2(product.basePrice), amounts.lines[index]!.discountAmount,
                    item.quantity, amounts.lines[index]!.lineTotal], transaction, type: QueryTypes.INSERT },
            );
            itemIds.set(item.variantId, serializeDatabaseEntityId(itemId));
        }
        await sql.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status,
                from_fulfillment_status, to_fulfillment_status, changed_by_account_id, changed_at)
             VALUES (?, NULL, 'pending', NULL, 'unfulfilled', ?, UTC_TIMESTAMP(3))`,
            { replacements: [orderId, input.accountId], transaction },
        );
        if (input.voucherCode !== null) {
            const claim = await new SequelizeVoucherClaimV2Repository(this.persistence, transaction)
                .claim({ orderId, code: input.voucherCode });
            if ("discountAmount" in claim && claim.kind === "claimed") {
                if (claim.discountAmount !== serializeMoney(discount)) throw new Error("Voucher discount drift.");
            } else reject("voucher_not_eligible");
        }

        // The reservation primitive owns inventory/hold locking. Discover inventory IDs
        // first so multiple item checkouts acquire inventory rows in ascending ID order.
        const inventoryRows = await sql.query<{ id: unknown; variantId: unknown }>(
            `SELECT id, product_variant_id AS variantId FROM inventories
             WHERE branch_id = ? AND product_variant_id IN (${placeholders}) ORDER BY id ASC`,
            { replacements: [input.branchId, ...input.items.map((item) => item.variantId)],
                transaction, type: QueryTypes.SELECT },
        );
        if (inventoryRows.length !== input.items.length) reject("insufficient_stock");
        const reservation = new InventoryReservationV2Service({ repository:
            new SequelizeInventoryReservationV2Repository(this.persistence, transaction) });
        for (const inventory of inventoryRows) {
            const variantId = serializeDatabaseEntityId(inventory.variantId);
            const itemId = itemIds.get(variantId);
            if (!itemId) throw new Error("Inventory variant does not match checkout item.");
            const hold = await reservation.reserveOrderItem({ orderItemId: itemId,
                idempotencyKey: `${input.checkoutKey}:item:${itemId}`, expiresAt: input.expiresAt });
            if (hold.kind === "insufficient_stock") reject("insufficient_stock");
            if (hold.kind !== "reserved") throw new Error(`Checkout hold failed: ${hold.kind}`);
        }
        await this.consumePurchasedCartItems(input, transaction);
        await sql.query(
            `INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id,
                payload, occurred_at, created_at, updated_at)
             VALUES (?, 'commerce.order.created', 'order', ?, ?, UTC_TIMESTAMP(3),
                UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [randomUUID(), orderId, JSON.stringify({ orderId, customerId: input.customerId,
                branchId: input.branchId, channel: "online", fulfillmentType: "store_pickup" })], transaction },
        );
        return { kind: "created", orderId };
    }

    /** A cart is optional at checkout. Serialize with cart mutations and leave additions/other lines intact. */
    private async consumePurchasedCartItems(input: PreparedOnlinePickupCheckout, transaction: Transaction): Promise<void> {
        const sql = this.persistence.sequelize;
        const carts = await sql.query<{ id: unknown }>(
            "SELECT id FROM carts WHERE customer_id = ? FOR UPDATE",
            { replacements: [input.customerId], transaction, type: QueryTypes.SELECT },
        );
        if (!carts[0]) return;
        const cartId = serializeDatabaseEntityId(carts[0].id);
        const placeholders = input.items.map(() => "?").join(", ");
        const cartItems = await sql.query<CartItemRow>(
            `SELECT id, product_variant_id AS variantId, quantity FROM cart_items
             WHERE cart_id = ? AND product_variant_id IN (${placeholders}) ORDER BY id ASC FOR UPDATE`,
            { replacements: [cartId, ...input.items.map((item) => item.variantId)], transaction, type: QueryTypes.SELECT },
        );
        const purchased = new Map(input.items.map((item) => [item.variantId, item.quantity]));
        for (const item of cartItems) {
            const quantity = purchased.get(serializeDatabaseEntityId(item.variantId));
            if (!quantity) continue;
            if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Invalid cart quantity.");
            const itemId = serializeDatabaseEntityId(item.id);
            if (item.quantity <= quantity) {
                await sql.query("DELETE FROM cart_items WHERE id = ? AND cart_id = ?",
                    { replacements: [itemId, cartId], transaction });
            } else {
                await sql.query("UPDATE cart_items SET quantity = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND cart_id = ?",
                    { replacements: [item.quantity - quantity, itemId, cartId], transaction });
            }
        }
    }
}
