import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { PosCashCheckoutV2Service } from "../../src/modules/commerce/application/pos-cash-checkout-v2.service.js";
import { SequelizePosCashCheckoutV2Repository } from "../../src/modules/commerce/persistence/pos-cash-checkout-v2.repository.js";
import { createPosCashCheckoutV2Router } from "../../src/modules/commerce/interfaces/http/pos-cash-checkout-v2.routes.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 POS cash checkout on MySQL", () => {
    let db: Sequelize;
    let service: PosCashCheckoutV2Service;
    let httpApp: express.Express;
    let actor: V2AccessContext;
    let branchId: string;
    let variantId: string;
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing POS checkout fixture.");
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
        service = new PosCashCheckoutV2Service({ repository:
            new SequelizePosCashCheckoutV2Repository(createSalesV2Persistence(db)) });
        await db.query("INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, 'POS branch', 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`PC-${suffix}`] });
        branchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`PC-${suffix}`])).id;
        await db.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`pos-${suffix}@example.test`] });
        const accountId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [`pos-${suffix}@example.test`])).id;
        await db.query("INSERT INTO employees (account_id, branch_id, code, full_name, status, created_at, updated_at) VALUES (?, ?, ?, 'POS Test', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [accountId, branchId, `PC-${suffix}`] });
        const employeeId = (await one<{ id: string }>("SELECT id FROM employees WHERE account_id = ?", [accountId])).id;
        actor = { accountId, customerId: null, employeeId, grants: [{ roleCode: "SALES_STAFF",
            scope: { type: "branch", branchId }, permissions: ["order.manage.branch"] }] };
        httpApp = express();
        httpApp.use(express.json());
        httpApp.use("/api/v1", createPosCashCheckoutV2Router({
            auth: (request, _response, next) => {
                (request as V2AuthenticatedRequest).v2AccessContext = actor;
                next();
            },
            checkout: service,
        }));
        await db.query("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'POS category', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`PC-${suffix}`, `pos-category-${suffix}`] });
        const categoryId = (await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`PC-${suffix}`])).id;
        await db.query("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'POS product', ?, '99.5000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [categoryId, `pos-product-${suffix}`] });
        const productId = (await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`pos-product-${suffix}`])).id;
        await db.query("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [`PC-${suffix}`] });
        const sizeId = (await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`PC-${suffix}`])).id;
        await db.query("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [productId, sizeId, `PC-${suffix}`] });
        variantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [`PC-${suffix}`])).id;
        await db.query("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 10, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", { replacements: [branchId, variantId] });
        await db.query("INSERT INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES ('CASH', 'Tiền mặt tại quầy', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE is_active = TRUE");
    });

    afterAll(async () => { await db?.close(); });

    it("collects the server-calculated cash total and consumes stock atomically without a pending POS hold", async () => {
        const input = { checkoutKey: `pos-cash-${suffix}`, branchId, items: [{ variantId, quantity: 2 }] };
        const created = await service.checkoutCashCarryOut(actor, input);
        expect(created.kind).toBe("created");
        if (created.kind !== "created") throw new Error("POS checkout must create an order.");
        await expect(service.checkoutCashCarryOut(actor, input)).resolves.toEqual({ kind: "replayed", orderId: created.orderId });
        await expect(service.checkoutCashCarryOut(actor, { ...input, items: [{ variantId, quantity: 1 }] }))
            .resolves.toEqual({ kind: "idempotency_conflict" });

        expect(await one<{ channel: string; fulfillmentType: string; status: string; fulfillmentStatus: string; customerId: string | null; totalAmount: string }>(
            "SELECT channel, fulfillment_type AS fulfillmentType, status, fulfillment_status AS fulfillmentStatus, customer_id AS customerId, total_amount AS totalAmount FROM orders WHERE id = ?", [created.orderId],
        )).toEqual({ channel: "in_store", fulfillmentType: "carry_out", status: "completed", fulfillmentStatus: "fulfilled", customerId: null, totalAmount: "200.0000" });
        expect(await one<{ provider: string; status: string; amount: string; collector: string }>(
            "SELECT provider, status, amount, collected_by_account_id AS collector FROM payments WHERE order_id = ?", [created.orderId],
        )).toEqual({ provider: "cash", status: "completed", amount: "200.0000", collector: actor.accountId });
        expect((await one<{ stock: number }>("SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId])).stock).toBe(8);
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM inventory_reservations r JOIN order_items oi ON oi.id = r.order_item_id WHERE oi.order_id = ? AND r.status = 'consumed' AND r.confirmed_at IS NOT NULL AND r.expires_at IS NULL", [created.orderId])).count)).toBe(1);
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'order' AND reference_id = ? AND reason = 'order_handover'", [created.orderId])).count)).toBe(1);
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM order_status_history WHERE order_id = ?", [created.orderId])).count)).toBe(3);
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM outbox_events WHERE aggregate_id = ? AND event_type IN ('commerce.order.created', 'commerce.order.confirmed')", [created.orderId])).count)).toBe(2);
    });

    it("rolls back the order and cash collection when one POS line cannot reserve stock", async () => {
        const checkoutKey = `pos-cash-no-stock-${suffix}`;
        await expect(service.checkoutCashCarryOut(actor, {
            checkoutKey, branchId, items: [{ variantId, quantity: 9 }],
        })).resolves.toEqual({ kind: "insufficient_stock" });

        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM orders WHERE checkout_key = ?", [checkoutKey])).count)).toBe(0);
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM payments WHERE merchant_reference = ?", [`POS-CASH:${checkoutKey}`])).count)).toBe(0);
        expect((await one<{ stock: number }>("SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId])).stock).toBe(8);
    });

    it("makes a concurrent retry with one checkout key collect and consume exactly once", async () => {
        const input = { checkoutKey: `pos-cash-race-${suffix}`, branchId, items: [{ variantId, quantity: 1 }] };
        const results = await Promise.all([
            service.checkoutCashCarryOut(actor, input),
            service.checkoutCashCarryOut(actor, input),
        ]);
        expect(results.map((result) => result.kind).sort()).toEqual(["created", "replayed"]);
        const created = results.find((result) => result.kind === "created");
        if (!created || created.kind !== "created") throw new Error("One POS checkout must win.");
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM payments WHERE order_id = ?", [created.orderId])).count)).toBe(1);
        expect(Number((await one<{ count: string }>("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_id = ? AND reason = 'order_handover'", [created.orderId])).count)).toBe(1);
        expect((await one<{ stock: number }>("SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId])).stock).toBe(7);
    });

    it("rechecks the active staff assignment inside persistence before a POS write", async () => {
        await db.query("UPDATE employees SET status = 'inactive', updated_at = UTC_TIMESTAMP(3) WHERE id = ?", { replacements: [actor.employeeId!] });
        await expect(service.checkoutCashCarryOut(actor, {
            checkoutKey: `pos-cash-inactive-${suffix}`, branchId, items: [{ variantId, quantity: 1 }],
        })).resolves.toEqual({ kind: "checkout_unavailable" });
        await db.query("UPDATE employees SET status = 'active', updated_at = UTC_TIMESTAMP(3) WHERE id = ?", { replacements: [actor.employeeId!] });
    });

    it("keeps the V2 HTTP legacy envelope while executing the actual MySQL transaction", async () => {
        const stockBefore = (await one<{ stock: number }>(
            "SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId],
        )).stock;
        const response = await request(httpApp).post("/api/v1/order/in-store").send({
            checkoutKey: `pos-http-${suffix}`, branchId, items: [{ variantId, quantity: 1 }],
        }).expect(200);
        expect(response.body).toMatchObject({ EM: "Create in-store order successfully", EC: "0",
            DT: { id: expect.any(String) } });
        const orderId = response.body.DT.id as string;
        expect((await one<{ status: string; fulfillmentStatus: string }>(
            "SELECT status, fulfillment_status AS fulfillmentStatus FROM orders WHERE id = ?", [orderId],
        ))).toEqual({ status: "completed", fulfillmentStatus: "fulfilled" });
        expect((await one<{ stock: number }>(
            "SELECT stock FROM inventories WHERE branch_id = ? AND product_variant_id = ?", [branchId, variantId],
        )).stock).toBe(stockBefore - 1);
    });
});
