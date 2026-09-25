import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { OrderCheckoutV2Service } from "../../src/modules/commerce/application/order-checkout-v2.service.js";
import { SequelizeOrderCheckoutV2Repository } from "../../src/modules/commerce/persistence/order-checkout-v2.repository.js";
import { OrderConfirmationV2Service } from "../../src/modules/commerce/application/order-confirmation-v2.service.js";
import { SequelizeOrderConfirmationV2Repository } from "../../src/modules/commerce/persistence/order-confirmation-v2.repository.js";
import { OrderCancellationV2Service } from "../../src/modules/commerce/application/order-cancellation-v2.service.js";
import { SequelizeOrderCancellationV2Repository } from "../../src/modules/commerce/persistence/order-cancellation-v2.repository.js";
import { CartMutationV2Service } from "../../src/modules/commerce/application/cart-mutation-v2.service.js";
import { SequelizeCartMutationV2Repository } from "../../src/modules/commerce/persistence/cart-mutation-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 online pickup checkout on MySQL", () => {
    let db: Sequelize;
    let service: OrderCheckoutV2Service;
    let confirmation: OrderConfirmationV2Service;
    let cancellation: OrderCancellationV2Service;
    let actor: V2AccessContext;
    let branchId: string;
    let variantId: string;
    let voucherCode: string;
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing checkout fixture.");
        return rows[0];
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test DB required.");
        await runV2Migrations("up");
        db = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await db.authenticate();
        service = new OrderCheckoutV2Service({ repository:
            new SequelizeOrderCheckoutV2Repository(createSalesV2Persistence(db)) });
        confirmation = new OrderConfirmationV2Service({ repository:
            new SequelizeOrderConfirmationV2Repository(createSalesV2Persistence(db)) });
        cancellation = new OrderCancellationV2Service({ repository:
            new SequelizeOrderCancellationV2Repository(createSalesV2Persistence(db)) });
        const email = `checkout-${suffix}@example.test`;
        await db.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [email] });
        const accountId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [email])).id;
        await db.query("INSERT INTO customers (account_id, full_name, status, loyalty_points, created_at, updated_at) VALUES (?, 'Checkout test', 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [accountId] });
        const customerId = (await one<{ id: string }>("SELECT id FROM customers WHERE account_id = ?", [accountId])).id;
        actor = { accountId, customerId, employeeId: null, grants: [] };
        await db.query("INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, 'Checkout branch', 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`OC-${suffix}`] });
        branchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`OC-${suffix}`])).id;
        await db.query("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Checkout category', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`OC-${suffix}`, `checkout-category-${suffix}`] });
        const categoryId = (await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`OC-${suffix}`])).id;
        await db.query("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'Checkout product', ?, '99.5000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [categoryId, `checkout-product-${suffix}`] });
        const productId = (await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`checkout-product-${suffix}`])).id;
        await db.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`OC-${suffix}`] });
        const sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`OC-${suffix}`])).id;
        await db.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [productId, sizeId, `OC-${suffix}`] });
        variantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [`OC-${suffix}`])).id;
        await db.query("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 2, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [branchId, variantId] });
        voucherCode = `OC-${suffix}`;
        await db.query(`INSERT INTO vouchers (code, discount_type, discount_value, min_order_amount,
            applies_to_channel, branch_scope, starts_at, ends_at, status, created_at, updated_at)
            VALUES (?, 'fixed', '10.0000', '0.0000', 'online', 'all', UTC_TIMESTAMP(3) - INTERVAL 1 DAY,
            UTC_TIMESTAMP(3) + INTERVAL 1 DAY, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, { replacements: [voucherCode] });
    });
    afterAll(async () => { await db?.close(); });

    it("atomically snapshots price, claims voucher, holds stock and records one outbox event", async () => {
        const input = { checkoutKey: `checkout-${suffix}`, branchId, items: [{ variantId, quantity: 1 }],
            recipientName: "Nguyen A", recipientPhone: "0900000000", voucherCode };
        const first = await service.checkoutOnlinePickup(actor, input);
        expect(first.kind).toBe("created");
        if (first.kind !== "created") throw new Error("Checkout must create an order.");
        expect(await service.checkoutOnlinePickup(actor, input)).toEqual({ kind: "replayed", orderId: first.orderId });
        expect(await service.checkoutOnlinePickup(actor, { ...input, items: [{ variantId, quantity: 2 }] }))
            .toEqual({ kind: "idempotency_conflict" });
        expect(await service.checkoutOnlinePickup(actor, { ...input, checkoutKey: input.checkoutKey.toUpperCase() }))
            .toEqual({ kind: "replayed", orderId: first.orderId });
        const order = await one<{ subtotalAmount: string; discountAmount: string; totalAmount: string }>(
            "SELECT subtotal_amount AS subtotalAmount, discount_amount AS discountAmount, total_amount AS totalAmount FROM orders WHERE id = ?", [first.orderId]);
        expect(order).toEqual({ subtotalAmount: "100.0000", discountAmount: "10.0000", totalAmount: "90.0000" });
        const item = await one<{ unitPrice: string; discountAmount: string; lineTotal: string }>(
            "SELECT unit_price AS unitPrice, discount_amount AS discountAmount, line_total AS lineTotal FROM order_items WHERE order_id = ?", [first.orderId]);
        expect(item).toEqual({ unitPrice: "100.0000", discountAmount: "10.0000", lineTotal: "90.0000" });
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM inventory_reservations WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)", [first.orderId])).n)).toBe(1);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM voucher_redemptions WHERE order_id = ?", [first.orderId])).n)).toBe(1);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM outbox_events WHERE aggregate_type = 'order' AND aggregate_id = ?", [first.orderId])).n)).toBe(1);
        const manager: V2AccessContext = { accountId: actor.accountId, customerId: null, employeeId: null,
            grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["order.manage.global"] }] };
        expect(await confirmation.confirm(manager, first.orderId)).toEqual({ kind: "payment_not_settled" });
        expect((await one<{ status: string }>("SELECT status FROM orders WHERE id = ?", [first.orderId])).status).toBe("pending");
        await db.query("INSERT INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES (?, 'Test prepaid', 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`OC-PAY-${suffix}`] });
        const methodId = (await one<{ id: string }>("SELECT id FROM payment_methods WHERE code = ?", [`OC-PAY-${suffix}`])).id;
        await db.query(`INSERT INTO payments (order_id, payment_method_id, provider, merchant_reference, amount,
            status, paid_at, created_at, updated_at) VALUES (?, ?, 'test', ?, '90.0000', 'completed',
            UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [first.orderId, methodId, `OC-PAY-${suffix}`] });
        await db.query(`UPDATE inventory_reservations SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND
            WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`,
        { replacements: [first.orderId] });
        expect(await confirmation.confirm(manager, first.orderId)).toEqual({ kind: "reservation_expired" });
        expect((await one<{ status: string }>("SELECT status FROM orders WHERE id = ?", [first.orderId])).status).toBe("pending");
        expect((await one<{ status: string }>("SELECT status FROM voucher_redemptions WHERE order_id = ?", [first.orderId])).status).toBe("reserved");
        await db.query(`UPDATE inventory_reservations SET expires_at = UTC_TIMESTAMP(3) + INTERVAL 10 MINUTE
            WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`,
        { replacements: [first.orderId] });
        expect(await confirmation.confirm(manager, first.orderId)).toEqual({ kind: "confirmed", orderId: first.orderId });
        expect(await confirmation.confirm(manager, first.orderId)).toEqual({ kind: "replayed", orderId: first.orderId });
        expect((await one<{ status: string }>("SELECT status FROM voucher_redemptions WHERE order_id = ?", [first.orderId])).status).toBe("redeemed");
        const hold = await one<{ confirmedAt: Date | null; expiresAt: Date | null }>(
            `SELECT confirmed_at AS confirmedAt, expires_at AS expiresAt FROM inventory_reservations
             WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`, [first.orderId]);
        expect(hold.confirmedAt).not.toBeNull();
        expect(hold.expiresAt).toBeNull();
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM outbox_events WHERE aggregate_type = 'order' AND aggregate_id = ?", [first.orderId])).n)).toBe(2);
    });

    it("rolls back order, voucher and event when stock is unavailable", async () => {
        const key = `checkout-no-stock-${suffix}`;
        const result = await service.checkoutOnlinePickup(actor, { checkoutKey: key, branchId,
            items: [{ variantId, quantity: 2 }], recipientName: "Nguyen A",
            recipientPhone: "0900000000", voucherCode });
        expect(result).toEqual({ kind: "insufficient_stock" });
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM orders WHERE checkout_key = ?", [key])).n)).toBe(0);
    });

    it("consumes only purchased quantities from the buyer cart atomically and only once", async () => {
        const sizeName = `OC-CART-${suffix}`;
        await db.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [sizeName] });
        const sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [sizeName])).id;
        const productId = (await one<{ id: string }>("SELECT product_id AS id FROM product_variants WHERE id = ?", [variantId])).id;
        const sku = `OC-CART-${suffix}`;
        await db.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [productId, sizeId, sku] });
        const cartVariantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [sku])).id;
        await db.query("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 4, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [branchId, cartVariantId] });
        await db.query("INSERT INTO carts (customer_id, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [actor.customerId] });
        const cartId = (await one<{ id: string }>("SELECT id FROM carts WHERE customer_id = ?", [actor.customerId])).id;
        await db.query(`INSERT INTO cart_items (cart_id, product_variant_id, quantity, created_at, updated_at)
            VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, 7, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [cartId, cartVariantId, cartId, variantId] });
        const input = { checkoutKey: `checkout-cart-${suffix}`, branchId,
            items: [{ variantId: cartVariantId, quantity: 2 }], recipientName: "Nguyen A",
            recipientPhone: "0900000000", voucherCode: null };
        const created = await service.checkoutOnlinePickup(actor, input);
        expect(created.kind).toBe("created");
        if (created.kind !== "created") throw new Error("Cart checkout fixture failed.");
        expect((await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, cartVariantId])).quantity).toBe(1);
        expect((await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, variantId])).quantity).toBe(7);
        expect(await service.checkoutOnlinePickup(actor, input)).toEqual({ kind: "replayed", orderId: created.orderId });
        expect((await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, cartVariantId])).quantity).toBe(1);
        const failed = await service.checkoutOnlinePickup(actor, { ...input, checkoutKey: `checkout-cart-fail-${suffix}`,
            items: [{ variantId: cartVariantId, quantity: 3 }] });
        expect(failed).toEqual({ kind: "insufficient_stock" });
        expect((await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, cartVariantId])).quantity).toBe(1);
        const cartMutation = new CartMutationV2Service({ repository:
            new SequelizeCartMutationV2Repository(createSalesV2Persistence(db)) });
        const [add, concurrentCheckout] = await Promise.all([
            cartMutation.add(actor, { productVariantId: cartVariantId, quantity: 1 }),
            service.checkoutOnlinePickup(actor, { ...input, checkoutKey: `checkout-cart-race-${suffix}`,
                items: [{ variantId: cartVariantId, quantity: 1 }] }),
        ]);
        expect(add.kind).toBe("added");
        expect(concurrentCheckout.kind).toBe("created");
        expect((await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, cartVariantId])).quantity).toBe(1);
        const consumeLast = await service.checkoutOnlinePickup(actor, { ...input,
            checkoutKey: `checkout-cart-last-${suffix}`, items: [{ variantId: cartVariantId, quantity: 1 }] });
        expect(consumeLast.kind).toBe("created");
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, cartVariantId])).count)).toBe(0);
        expect((await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_variant_id = ?",
            [cartId, variantId])).quantity).toBe(7);
    });

    it("rolls back an already-inserted order when the voucher is ineligible at its locked claim", async () => {
        const code = `OC-MIN-${suffix}`;
        await db.query(`INSERT INTO vouchers (code, discount_type, discount_value, min_order_amount,
            applies_to_channel, branch_scope, starts_at, ends_at, status, created_at, updated_at)
            VALUES (?, 'fixed', '10.0000', '101.0000', 'online', 'all', UTC_TIMESTAMP(3) - INTERVAL 1 DAY,
            UTC_TIMESTAMP(3) + INTERVAL 1 DAY, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, { replacements: [code] });
        const key = `checkout-ineligible-${suffix}`;
        expect(await service.checkoutOnlinePickup(actor, { checkoutKey: key, branchId,
            items: [{ variantId, quantity: 1 }], recipientName: "Nguyen A",
            recipientPhone: "0900000000", voucherCode: code })).toEqual({ kind: "voucher_not_eligible" });
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM orders WHERE checkout_key = ?", [key])).n)).toBe(0);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM voucher_redemptions WHERE voucher_code_snapshot = ?", [code])).n)).toBe(0);
    });

    it("allows only one of two different checkout keys to claim the last available unit", async () => {
        const keys = [`race-a-${suffix}`, `race-b-${suffix}`];
        const results = await Promise.all(keys.map((checkoutKey) => service.checkoutOnlinePickup(actor, {
            checkoutKey, branchId, items: [{ variantId, quantity: 1 }],
            recipientName: "Nguyen A", recipientPhone: "0900000000", voucherCode: null,
        })));
        expect(results.map((result) => result.kind).sort()).toEqual(["created", "insufficient_stock"]);
        const createdCount = await one<{ n: string }>("SELECT COUNT(*) AS n FROM orders WHERE checkout_key IN (?, ?)", keys);
        expect(Number(createdCount.n)).toBe(1);
    });

    it("cancels only after payment attempts are terminal, releasing voucher and hold atomically", async () => {
        const sizeName = `OC-CANCEL-${suffix}`;
        await db.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [sizeName] });
        const sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [sizeName])).id;
        const productId = (await one<{ id: string }>("SELECT product_id AS id FROM product_variants WHERE id = ?", [variantId])).id;
        const sku = `OC-CANCEL-${suffix}`;
        await db.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [productId, sizeId, sku] });
        const cancelVariantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [sku])).id;
        await db.query("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [branchId, cancelVariantId] });
        const checkout = await service.checkoutOnlinePickup(actor, {
            checkoutKey: `checkout-cancel-${suffix}`, branchId, items: [{ variantId: cancelVariantId, quantity: 1 }],
            recipientName: "Nguyen A", recipientPhone: "0900000000", voucherCode,
        });
        expect(checkout.kind).toBe("created");
        if (checkout.kind !== "created") throw new Error("Cancellation fixture checkout failed.");
        const manager: V2AccessContext = { accountId: actor.accountId, customerId: null, employeeId: null,
            grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["order.manage.global"] }] };
        const methodCode = `OC-CANCEL-PAY-${suffix}`;
        await db.query("INSERT INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES (?, 'Cancel test prepaid', 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [methodCode] });
        const methodId = (await one<{ id: string }>("SELECT id FROM payment_methods WHERE code = ?", [methodCode])).id;
        await db.query(`INSERT INTO payments (order_id, payment_method_id, provider, merchant_reference, amount,
            status, created_at, updated_at) VALUES (?, ?, 'test', ?, '90.0000', 'processing',
            UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, { replacements: [checkout.orderId, methodId, `OC-CANCEL-${suffix}`] });
        expect(await cancellation.cancel(manager, checkout.orderId, "Khách yêu cầu"))
            .toEqual({ kind: "payment_unresolved" });
        expect((await one<{ status: string }>("SELECT status FROM orders WHERE id = ?", [checkout.orderId])).status).toBe("pending");
        await db.query("UPDATE payments SET status = 'failed' WHERE merchant_reference = ?", { replacements: [`OC-CANCEL-${suffix}`] });
        expect(await cancellation.cancel(manager, checkout.orderId, "Khách yêu cầu"))
            .toEqual({ kind: "cancelled", orderId: checkout.orderId });
        expect(await cancellation.cancel(manager, checkout.orderId, "Khách yêu cầu"))
            .toEqual({ kind: "replayed", orderId: checkout.orderId });
        const order = await one<{ status: string; fulfillmentStatus: string }>(
            "SELECT status, fulfillment_status AS fulfillmentStatus FROM orders WHERE id = ?", [checkout.orderId]);
        expect(order).toEqual({ status: "cancelled", fulfillmentStatus: "cancelled" });
        expect((await one<{ status: string }>("SELECT status FROM voucher_redemptions WHERE order_id = ?", [checkout.orderId])).status).toBe("released");
        expect((await one<{ status: string }>(`SELECT status FROM inventory_reservations WHERE order_item_id IN
            (SELECT id FROM order_items WHERE order_id = ?)`, [checkout.orderId])).status).toBe("released");
        expect((await one<{ stock: number }>("SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?",
            [branchId, cancelVariantId])).stock).toBe(1);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM outbox_events WHERE aggregate_type = 'order' AND aggregate_id = ?",
            [checkout.orderId])).n)).toBe(2);
    });

    it("does not report replay for an unsupported delivery order", async () => {
        const manager: V2AccessContext = { accountId: actor.accountId, customerId: null, employeeId: null,
            grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["order.manage.global"] }] };
        for (const status of ["cancelled", "confirmed"] as const) {
            const code = `OC-DEL-${status}-${suffix}`;
            await db.query(`INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id,
                created_by_account_id, channel, fulfillment_type, fulfillment_status, status,
                subtotal_amount, discount_amount, shipping_fee, total_amount, placed_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'online', 'delivery', ?, ?, 0, 0, 0, 0,
                UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [code, code, actor.customerId, branchId, actor.accountId,
                status === "cancelled" ? "cancelled" : "unfulfilled", status] });
            const orderId = (await one<{ id: string }>("SELECT id FROM orders WHERE code = ?", [code])).id;
            if (status === "cancelled") {
                expect(await cancellation.cancel(manager, orderId, "Test unsupported type"))
                    .toEqual({ kind: "order_not_cancellable" });
            } else {
                expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "order_not_pending" });
            }
        }
    });
});
