import { randomUUID } from "node:crypto";
import { QueryTypes, type Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createV2Sequelize } from "../../src/database/v2/connection.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { OrderCheckoutV2Service } from "../../src/modules/commerce/application/order-checkout-v2.service.js";
import { OrderConfirmationV2Service } from "../../src/modules/commerce/application/order-confirmation-v2.service.js";
import { SequelizeOrderCheckoutV2Repository } from "../../src/modules/commerce/persistence/order-checkout-v2.repository.js";
import { SequelizeOrderConfirmationV2Repository } from "../../src/modules/commerce/persistence/order-confirmation-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { SequelizeInventoryReservationExpiryV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-reservation-expiry-v2.repository.js";
import { VnPayAttemptV2Service } from "../../src/modules/payment/application/vnpay-attempt-v2.service.js";
import type { ApplyVnPayCallback } from "../../src/modules/payment/application/vnpay-payment-callback-v2.service.js";
import { SequelizeVnPayAttemptV2Repository } from "../../src/modules/payment/persistence/vnpay-attempt-v2.repository.js";
import { SequelizeVnPayPaymentCallbackV2Repository } from "../../src/modules/payment/persistence/vnpay-payment-callback-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 prepaid pickup hold lifecycle on MySQL", () => {
    let db: Sequelize;
    let checkout: OrderCheckoutV2Service;
    let confirmation: OrderConfirmationV2Service;
    let attempts: VnPayAttemptV2Service;
    let callbacks: SequelizeVnPayPaymentCallbackV2Repository;
    let expiry: SequelizeInventoryReservationExpiryV2Repository;
    let buyer: V2AccessContext;
    let manager: V2AccessContext;
    let branchId: string;
    let variantId: string;
    let methodId: string;
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing prepaid pickup fixture.");
        return rows[0];
    };

    const createPickup = async (label: string) => {
        const result = await checkout.checkoutOnlinePickup(buyer, {
            checkoutKey: `paid-hold:${suffix}:${label}`, branchId, voucherCode: null,
            recipientName: "Paid hold test buyer", recipientPhone: "0900000000",
            items: [{ variantId, quantity: 1 }],
        });
        expect(result.kind).toBe("created");
        if (result.kind !== "created") throw new Error(`Pickup fixture failed: ${result.kind}`);
        const hold = await one<{ id: string }>(`SELECT r.id FROM inventory_reservations r
            JOIN order_items oi ON oi.id = r.order_item_id WHERE oi.order_id = ?`, [result.orderId]);
        return { orderId: result.orderId, holdId: serializeEntityId(hold.id) };
    };

    const advancePastPaymentDeadline = async (holdId: string) => {
        // Simulate elapsed time, not application recovery: never move the deadline forward.
        await db.query("UPDATE inventory_reservations SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE WHERE id = ?",
            { replacements: [holdId] });
    };

    const reservePayment = async (orderId: string) => {
        const result = await attempts.reserve(buyer, { orderId, requestKey: `attempt-${randomUUID()}` });
        expect(result.kind).toBe("created");
        if (result.kind !== "created") throw new Error(`Payment fixture failed: ${result.kind}`);
        return result;
    };

    const verifiedSuccess = (payment: Awaited<ReturnType<typeof reservePayment>>): ApplyVnPayCallback => ({
        kind: "verified", paymentId: payment.paymentId, transactionReference: `V2${payment.paymentId}`,
        amount: payment.amount, providerTransactionId: `paid-hold-${payment.paymentId}`,
        outcome: "completed", responseCode: "00", transactionStatus: "00",
        eventKey: `vnpay:paid-hold:${payment.paymentId}`,
    });

    const addPayment = async (orderId: string, status: string, amount: string) => {
        await db.query(`INSERT INTO payments (order_id, payment_method_id, provider, merchant_reference,
            amount, status, paid_at, created_at, updated_at)
            VALUES (?, ?, 'test', ?, ?, ?, CASE WHEN ? = 'completed' THEN UTC_TIMESTAMP(3) ELSE NULL END,
                UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, {
            replacements: [orderId, methodId, `paid-hold:${randomUUID()}`, amount, status, status],
        });
    };

    const assertPendingActive = async (orderId: string, holdId: string) => {
        expect(await one<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]))
            .toEqual({ status: "pending" });
        expect(await one<{ status: string; confirmedAt: Date | null }>(
            "SELECT status, confirmed_at AS confirmedAt FROM inventory_reservations WHERE id = ?", [holdId]))
            .toEqual({ status: "active", confirmedAt: null });
    };

    beforeAll(async () => {
        const target = env.V2_MIGRATIONS_TARGET_DATABASE;
        if (!target?.endsWith("_test")) throw new Error("Explicit _test database required before any write.");
        await runV2Migrations("up");
        db = createV2Sequelize(target);
        await db.authenticate();
        expect((await one<{ name: string }>("SELECT DATABASE() AS name")).name).toBe(target);
        expect((await one<{ zone: string }>("SELECT @@session.time_zone AS zone")).zone).toBe("+00:00");
        const persistence = createSalesV2Persistence(db);
        checkout = new OrderCheckoutV2Service({ repository: new SequelizeOrderCheckoutV2Repository(persistence) });
        confirmation = new OrderConfirmationV2Service({ repository: new SequelizeOrderConfirmationV2Repository(persistence) });
        attempts = new VnPayAttemptV2Service({ repository: new SequelizeVnPayAttemptV2Repository(persistence) });
        callbacks = new SequelizeVnPayPaymentCallbackV2Repository(persistence);
        expiry = new SequelizeInventoryReservationExpiryV2Repository(persistence);

        const email = `paid-hold-${suffix}@example.test`;
        await db.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [email] });
        const accountId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [email])).id;
        await db.query("INSERT INTO customers (account_id, full_name, status, loyalty_points, created_at, updated_at) VALUES (?, 'Paid hold buyer', 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [accountId] });
        const customerId = (await one<{ id: string }>("SELECT id FROM customers WHERE account_id = ?", [accountId])).id;
        buyer = { accountId, customerId, employeeId: null, grants: [] };
        manager = { accountId, customerId: null, employeeId: null,
            grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["order.manage.global"] }] };
        await db.query("INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, 'Paid hold branch', 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`PH-${suffix}`] });
        branchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`PH-${suffix}`])).id;
        await db.query("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Paid hold category', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`PH-${suffix}`, `paid-hold-${suffix}`] });
        const categoryId = (await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`PH-${suffix}`])).id;
        await db.query("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'Paid hold product', ?, '100.0000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [categoryId, `paid-hold-product-${suffix}`] });
        const productId = (await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`paid-hold-product-${suffix}`])).id;
        await db.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`PH-${suffix}`] });
        const sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`PH-${suffix}`])).id;
        await db.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [productId, sizeId, `PH-${suffix}`] });
        variantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [`PH-${suffix}`])).id;
        await db.query("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 100, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [branchId, variantId] });
        await db.query("INSERT IGNORE INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES ('VNPAY', 'VNPAY', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))");
        methodId = (await one<{ id: string }>("SELECT id FROM payment_methods WHERE code = 'VNPAY'")).id;
    });
    afterAll(async () => {
        if (!db) return;
        try {
            // Remove only this run's UUID-scoped fixtures, including those left by
            // a failed assertion. Never truncate a shared test/reference table.
            await db.transaction(async (transaction) => {
                const replacements = [`paid-hold:${suffix}:%`];
                for (const sql of [
                    "DELETE e FROM payment_events e JOIN payments p ON p.id = e.payment_id JOIN orders o ON o.id = p.order_id WHERE o.checkout_key LIKE ?",
                    "DELETE p FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.checkout_key LIKE ?",
                    "DELETE h FROM order_status_history h JOIN orders o ON o.id = h.order_id WHERE o.checkout_key LIKE ?",
                    "DELETE e FROM outbox_events e JOIN orders o ON o.id = e.aggregate_id WHERE e.aggregate_type = 'order' AND o.checkout_key LIKE ?",
                    "DELETE r FROM inventory_reservations r JOIN order_items oi ON oi.id = r.order_item_id JOIN orders o ON o.id = oi.order_id WHERE o.checkout_key LIKE ?",
                    "DELETE oi FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.checkout_key LIKE ?",
                    "DELETE FROM orders WHERE checkout_key LIKE ?",
                ]) await db.query(sql, { replacements, transaction });
                await db.query("DELETE i FROM inventories i JOIN branches b ON b.id = i.branch_id WHERE b.code = ?",
                    { replacements: [`PH-${suffix}`], transaction });
                await db.query("DELETE FROM product_variants WHERE sku = ?", { replacements: [`PH-${suffix}`], transaction });
                await db.query("DELETE FROM products WHERE slug = ?", { replacements: [`paid-hold-product-${suffix}`], transaction });
                await db.query("DELETE FROM categories WHERE code = ?", { replacements: [`PH-${suffix}`], transaction });
                await db.query("DELETE FROM sizes WHERE name = ?", { replacements: [`PH-${suffix}`], transaction });
                await db.query("DELETE FROM branches WHERE code = ?", { replacements: [`PH-${suffix}`], transaction });
                await db.query("DELETE c FROM customers c JOIN accounts a ON a.id = c.account_id WHERE a.email = ?",
                    { replacements: [`paid-hold-${suffix}@example.test`], transaction });
                await db.query("DELETE FROM accounts WHERE email = ?",
                    { replacements: [`paid-hold-${suffix}@example.test`], transaction });
            });
        } finally { await db.close(); }
    });

    it("confirms a fully verified paid pickup after its deadline and replays without duplicate history or events", async () => {
        const { orderId, holdId } = await createPickup("paid");
        const payment = await reservePayment(orderId);
        const callback = verifiedSuccess(payment);
        expect(await callbacks.apply(callback)).toEqual({ kind: "processed", paymentId: payment.paymentId, status: "completed" });
        await advancePastPaymentDeadline(holdId);
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "skipped" });
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "confirmed", orderId });
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "replayed", orderId });
        expect(await callbacks.apply(callback)).toEqual({ kind: "replayed", paymentId: payment.paymentId, status: "completed" });
        const hold = await one<{ status: string; confirmedAt: Date | null; expiresAt: Date | null }>(
            "SELECT status, confirmed_at AS confirmedAt, expires_at AS expiresAt FROM inventory_reservations WHERE id = ?", [holdId]);
        expect(hold.status).toBe("active");
        expect(hold.confirmedAt).toBeInstanceOf(Date);
        expect(hold.expiresAt).toBeNull();
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM order_status_history WHERE order_id = ? AND to_status = 'confirmed'", [orderId])).n)).toBe(1);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM outbox_events WHERE aggregate_type = 'order' AND aggregate_id = ? AND event_type = 'commerce.order.confirmed'", [orderId])).n)).toBe(1);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM payment_events WHERE payment_id = ?", [payment.paymentId])).n)).toBe(1);
    });

    it("serializes expired paid confirmation against the expiry worker without releasing the hold", async () => {
        const { orderId, holdId } = await createPickup("race");
        const payment = await reservePayment(orderId);
        await callbacks.apply(verifiedSuccess(payment));
        await advancePastPaymentDeadline(holdId);
        const [confirmed, expired] = await Promise.all([
            confirmation.confirm(manager, orderId), expiry.expireCandidate(holdId),
        ]);
        expect(confirmed).toEqual({ kind: "confirmed", orderId });
        expect(expired).toEqual({ kind: "skipped" });
        expect((await one<{ status: string }>("SELECT status FROM inventory_reservations WHERE id = ?", [holdId])).status).toBe("active");
    });

    it("accepts a verified late callback while an unknown attempt still protects the active hold", async () => {
        const { orderId, holdId } = await createPickup("late-callback");
        const payment = await reservePayment(orderId);
        await advancePastPaymentDeadline(holdId);
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "skipped" });
        expect(await callbacks.apply(verifiedSuccess(payment))).toMatchObject({ kind: "processed", status: "completed" });
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "confirmed", orderId });
    });

    it("does not confirm an unpaid overdue pickup and expires its hold once without moving stock", async () => {
        const { orderId, holdId } = await createPickup("unpaid");
        await advancePastPaymentDeadline(holdId);
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "payment_not_settled" });
        await assertPendingActive(orderId, holdId);
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "expired" });
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "skipped" });
        expect((await one<{ stock: number }>("SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId])).stock).toBe(100);
        expect(Number((await one<{ n: string }>(`SELECT COUNT(*) AS n FROM inventory_movements m
            JOIN order_items oi ON oi.id = m.order_item_id WHERE oi.order_id = ?`, [orderId])).n)).toBe(0);
    });

    it("protects a partially paid overdue hold but never treats it as fully settled", async () => {
        const { orderId, holdId } = await createPickup("partial");
        await addPayment(orderId, "completed", "40.0000");
        await advancePastPaymentDeadline(holdId);
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "payment_not_settled" });
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "skipped" });
        await assertPendingActive(orderId, holdId);
    });

    it.each(["pending", "processing"])("does not expire or confirm an overdue hold with a %s payment", async (status) => {
        const { orderId, holdId } = await createPickup(`unknown-${status}`);
        await addPayment(orderId, status, "100.0000");
        await advancePastPaymentDeadline(holdId);
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "payment_not_settled" });
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "skipped" });
        await assertPendingActive(orderId, holdId);
    });

    it.each(["pending", "processing"])("rejects confirmation despite full completed money when another attempt remains %s", async (status) => {
        const { orderId, holdId } = await createPickup(`settled-with-${status}`);
        const payment = await reservePayment(orderId);
        await callbacks.apply(verifiedSuccess(payment));
        // Explicit inconsistent legacy/provider state: confirmation must fail closed,
        // even though normal attempt allocation prevents creating this combination.
        await addPayment(orderId, status, "1.0000");
        expect(await confirmation.confirm(manager, orderId)).toEqual({ kind: "payment_not_settled" });
        await assertPendingActive(orderId, holdId);
        await advancePastPaymentDeadline(holdId);
        expect(await expiry.expireCandidate(holdId)).toEqual({ kind: "skipped" });
    });

    it.each(["released", "expired"])("never resurrects a %s hold merely because the payment completed", async (status) => {
        const { orderId, holdId } = await createPickup(`finalized-${status}`);
        const payment = await reservePayment(orderId);
        await callbacks.apply(verifiedSuccess(payment));
        await advancePastPaymentDeadline(holdId);
        await db.query("UPDATE inventory_reservations SET status = ?, released_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [status, holdId] });
        const result = await confirmation.confirm(manager, orderId);
        expect(["confirmed", "replayed"]).not.toContain(result.kind);
        expect((await one<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId])).status).toBe("pending");
        expect((await one<{ status: string }>("SELECT status FROM inventory_reservations WHERE id = ?", [holdId])).status).toBe(status);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM order_status_history WHERE order_id = ? AND to_status = 'confirmed'", [orderId])).n)).toBe(0);
    });
});
