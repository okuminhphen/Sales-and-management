import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { VnPayAttemptV2Service } from "../../src/modules/payment/application/vnpay-attempt-v2.service.js";
import { SequelizeVnPayAttemptV2Repository } from "../../src/modules/payment/persistence/vnpay-attempt-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 VNPay attempt reservation on MySQL", () => {
    let db: Sequelize;
    let service: VnPayAttemptV2Service;
    let buyer: V2AccessContext;
    let branchId: string;
    let methodId: string;
    let variantId: string;
    let inventoryId: string;
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing payment attempt fixture.");
        return rows[0];
    };
    const createOrder = async (code: string, totalAmount = "100.0000", withHold = true): Promise<string> => {
        await db.query(`INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id,
            created_by_account_id, channel, fulfillment_type, fulfillment_status, status,
            subtotal_amount, discount_amount, shipping_fee, total_amount, placed_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'online', 'store_pickup', 'unfulfilled', 'pending',
                ?, '0.0000', '0.0000', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, {
            replacements: [code, code, buyer.customerId, branchId, buyer.accountId, totalAmount, totalAmount],
        });
        const orderId = (await one<{ id: string }>("SELECT id FROM orders WHERE code = ?", [code])).id;
        await db.query(`INSERT INTO order_items (order_id, product_variant_id, sku_snapshot,
            product_name_snapshot, size_name_snapshot, unit_price, quantity, line_total, created_at)
            VALUES (?, ?, 'VNP-SKU', 'VNPay product', 'M', ?, 1, ?, UTC_TIMESTAMP(3))`, {
            replacements: [orderId, variantId, totalAmount, totalAmount],
        });
        if (withHold) {
            const itemId = (await one<{ id: string }>("SELECT id FROM order_items WHERE order_id = ?", [orderId])).id;
            await db.query(`INSERT INTO inventory_reservations (inventory_id, order_item_id, quantity,
                status, expires_at, idempotency_key, created_at, updated_at)
                VALUES (?, ?, 1, 'active', UTC_TIMESTAMP(3) + INTERVAL 15 MINUTE,
                    ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, {
                replacements: [inventoryId, itemId, `vnp-hold:${orderId}`],
            });
        }
        return orderId;
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required.");
        await runV2Migrations("up");
        db = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await db.authenticate();
        const email = `vnpay-attempt-${suffix}@example.test`;
        await db.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [email] });
        const accountId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [email])).id;
        await db.query("INSERT INTO customers (account_id, full_name, status, loyalty_points, created_at, updated_at) VALUES (?, 'VNPay buyer', 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [accountId] });
        const customerId = (await one<{ id: string }>("SELECT id FROM customers WHERE account_id = ?", [accountId])).id;
        buyer = { accountId, customerId, employeeId: null, grants: [] };
        await db.query("INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, 'VNPay branch', 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`VNP-${suffix}`] });
        branchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`VNP-${suffix}`])).id;
        await db.query("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'VNPay category', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`VNP-${suffix}`, `vnp-${suffix}`] });
        const categoryId = (await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`VNP-${suffix}`])).id;
        await db.query("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'VNPay product', ?, '100.0000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [categoryId, `vnp-product-${suffix}`] });
        const productId = (await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`vnp-product-${suffix}`])).id;
        await db.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`VNP-${suffix}`] });
        const sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`VNP-${suffix}`])).id;
        await db.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [productId, sizeId, `VNP-${suffix}`] });
        variantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [`VNP-${suffix}`])).id;
        await db.query("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 100, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [branchId, variantId] });
        inventoryId = (await one<{ id: string }>("SELECT id FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId])).id;
        await db.query("INSERT INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES ('VNPAY', 'VNPAY', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE is_active = TRUE");
        methodId = (await one<{ id: string }>("SELECT id FROM payment_methods WHERE code = 'VNPAY'")).id;
        service = new VnPayAttemptV2Service({ repository:
            new SequelizeVnPayAttemptV2Repository(createSalesV2Persistence(db)) });
    });
    afterAll(async () => { await db?.close(); });

    it("reserves the remaining amount once and replays the same key", async () => {
        const orderId = await createOrder(`VNP-A-${suffix}`);
        const first = await service.reserve(buyer, { orderId, requestKey: `pay-a-${suffix}` });
        expect(first).toMatchObject({ kind: "created", amount: "100.0000", status: "pending" });
        if (first.kind !== "created") throw new Error("Payment reservation fixture failed.");
        expect(await service.reserve(buyer, { orderId, requestKey: `PAY-A-${suffix}` }))
            .toEqual({ ...first, kind: "replayed" });
        const stored = await one<{ amount: string; status: string; merchantReference: string }>(
            "SELECT amount, status, merchant_reference AS merchantReference FROM payments WHERE id = ?", [first.paymentId]);
        expect(stored).toEqual({ amount: "100.0000", status: "pending", merchantReference: first.merchantReference });
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM payments WHERE order_id = ?", [orderId])).n)).toBe(1);
    });

    it("replays an existing attempt after VNPay is disabled but refuses a new one", async () => {
        const orderId = await createOrder(`VNP-DISABLED-${suffix}`);
        const input = { orderId, requestKey: `pay-disabled-${suffix}` };
        const first = await service.reserve(buyer, input);
        expect(first.kind).toBe("created");
        await db.query("UPDATE payment_methods SET is_active = FALSE WHERE id = ?", { replacements: [methodId] });
        try {
            expect(await service.reserve(buyer, input)).toEqual({ ...first, kind: "replayed" });
            expect(await service.reserve(buyer, { orderId, requestKey: `pay-new-disabled-${suffix}` }))
                .toEqual({ kind: "payment_unavailable" });
        } finally {
            await db.query("UPDATE payment_methods SET is_active = TRUE WHERE id = ?", { replacements: [methodId] });
        }
    });

    it("does not create a new attempt while a concurrent admin disables VNPay", async () => {
        const orderId = await createOrder(`VNP-DISABLE-RACE-${suffix}`);
        const adminTransaction = await db.transaction();
        let committed = false;
        try {
            await db.query("UPDATE payment_methods SET is_active = FALSE WHERE id = ?", {
                replacements: [methodId], transaction: adminTransaction,
            });
            const attempt = service.reserve(buyer, { orderId, requestKey: `pay-disable-race-${suffix}` });
            await new Promise((resolve) => setTimeout(resolve, 100));
            await adminTransaction.commit();
            committed = true;
            expect(await attempt).toEqual({ kind: "payment_unavailable" });
            expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM payments WHERE order_id = ?",
                [orderId])).n)).toBe(0);
        } finally {
            if (!committed) await adminTransaction.rollback();
            await db.query("UPDATE payment_methods SET is_active = TRUE WHERE id = ?", { replacements: [methodId] });
        }
    });

    it("lets only one concurrent request reserve the remaining amount", async () => {
        const orderId = await createOrder(`VNP-RACE-${suffix}`);
        const results = await Promise.all(["left", "right"].map((side) => service.reserve(buyer, {
            orderId, requestKey: `pay-${side}-${suffix}`,
        })));
        expect(results.map((result) => result.kind).sort()).toEqual(["created", "payment_in_progress"]);
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM payments WHERE order_id = ?", [orderId])).n)).toBe(1);
    });

    it("uses completed payment to calculate only the remaining VND and rejects foreign orders", async () => {
        const orderId = await createOrder(`VNP-PART-${suffix}`);
        await db.query(`INSERT INTO payments (order_id, payment_method_id, provider, merchant_reference,
            amount, status, paid_at, created_at, updated_at)
            VALUES (?, ?, 'vnpay', ?, '40.0000', 'completed', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, {
            replacements: [orderId, methodId, `vnpay:prior:${suffix}`],
        });
        expect(await service.reserve({ ...buyer, customerId: "9223372036854775807" }, {
            orderId, requestKey: `pay-foreign-${suffix}`,
        })).toEqual({ kind: "forbidden" });
        expect(await service.reserve(buyer, { orderId, requestKey: `pay-part-${suffix}` }))
            .toMatchObject({ kind: "created", amount: "60.0000" });
    });

    it("refuses to start payment for an order with missing or expired stock holds", async () => {
        const missingOrderId = await createOrder(`VNP-MISSING-${suffix}`, "100.0000", false);
        expect(await service.reserve(buyer, { orderId: missingOrderId, requestKey: `pay-missing-${suffix}` }))
            .toEqual({ kind: "order_not_payable" });
        const expiredOrderId = await createOrder(`VNP-EXPIRED-${suffix}`);
        await db.query(`UPDATE inventory_reservations SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND
            WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`, {
            replacements: [expiredOrderId],
        });
        expect(await service.reserve(buyer, { orderId: expiredOrderId, requestKey: `pay-expired-${suffix}` }))
            .toEqual({ kind: "order_not_payable" });
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM payments WHERE order_id IN (?, ?)",
            [missingOrderId, expiredOrderId])).n)).toBe(0);
    });
});
