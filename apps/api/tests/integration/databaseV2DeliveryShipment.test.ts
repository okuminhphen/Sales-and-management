import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";
import { DeliveryShipmentV2Service } from "../../src/modules/commerce/application/delivery-shipment-v2.service.js";
import { SequelizeDeliveryShipmentV2Repository } from "../../src/modules/commerce/persistence/delivery-shipment-v2.repository.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 pending delivery shipment on MySQL", () => {
    let db: Sequelize;
    let service: DeliveryShipmentV2Service;
    let accountId: string;
    let customerId: string;
    let branchId: string;
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing delivery shipment fixture.");
        return rows[0];
    };
    const createOrder = async (code: string, fulfillmentType: "delivery" | "store_pickup" = "delivery"): Promise<string> => {
        await db.query(`INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id,
            created_by_account_id, channel, fulfillment_type, fulfillment_status, status, currency,
            subtotal_amount, discount_amount, shipping_fee, total_amount, placed_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'online', ?, 'unfulfilled', 'pending', 'VND',
                '100.0000', '0.0000', '0.0000', '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, {
            replacements: [code, code, customerId, branchId, accountId, fulfillmentType],
        });
        return (await one<{ id: string }>("SELECT id FROM orders WHERE code = ?", [code])).id;
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required.");
        await runV2Migrations("up");
        db = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await db.authenticate();
        await db.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`delivery-shipment-${suffix}@example.test`] });
        accountId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [`delivery-shipment-${suffix}@example.test`])).id;
        await db.query("INSERT INTO customers (account_id, full_name, status, loyalty_points, created_at, updated_at) VALUES (?, 'Delivery buyer', 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [accountId] });
        customerId = (await one<{ id: string }>("SELECT id FROM customers WHERE account_id = ?", [accountId])).id;
        await db.query("INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, 'Delivery branch', 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`DS-${suffix}`] });
        branchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`DS-${suffix}`])).id;
        service = new DeliveryShipmentV2Service({ repository:
            new SequelizeDeliveryShipmentV2Repository(createSalesV2Persistence(db)) });
    });
    afterAll(async () => { await db?.close(); });

    it("creates one pending delivery shipment and replays an identical request", async () => {
        const orderId = await createOrder(`DS-CREATE-${suffix}`);
        const input = { orderId, provider: "ghn", providerRequestKey: `delivery:${orderId}:1`,
            recipientName: "Nguyen Van A", recipientPhone: "0900000000", shippingAddress: "1 Test Street",
            provinceId: 1, districtId: 2, wardCode: "00001", codAmount: "100.0000" };
        const created = await service.create(input);
        expect(created).toMatchObject({ kind: "created", provider: "ghn", status: "pending", codAmount: "100.0000" });
        expect(await service.create(input)).toEqual({ ...created, kind: "replayed" });
        const stored = await one<{ status: string; codAmount: string; n: string }>(
            `SELECT status, cod_amount AS codAmount, COUNT(*) OVER () AS n FROM shipments WHERE order_id = ?`, [orderId]);
        expect(stored).toEqual({ status: "pending", codAmount: "100.0000", n: "1" });
    });

    it("rejects a shipment for pickup and prevents request-key reuse with another payload", async () => {
        const pickupId = await createOrder(`DS-PICKUP-${suffix}`, "store_pickup");
        const input = { orderId: pickupId, provider: "ghn", providerRequestKey: `delivery:${pickupId}:1`,
            recipientName: "Nguyen Van A", recipientPhone: "0900000000", shippingAddress: "1 Test Street",
            provinceId: null, districtId: null, wardCode: null, codAmount: "0.0000" };
        expect(await service.create(input)).toEqual({ kind: "order_not_delivery" });
        const deliveryId = await createOrder(`DS-CONFLICT-${suffix}`);
        const initial = { ...input, orderId: deliveryId, providerRequestKey: `delivery:${deliveryId}:1`, codAmount: "100.0000" };
        expect((await service.create(initial)).kind).toBe("created");
        expect(await service.create({ ...initial, recipientPhone: "0911111111" }))
            .toEqual({ kind: "idempotency_conflict" });
    });

    it("does not commit a pending shipment when its owning transaction rolls back", async () => {
        const orderId = await createOrder(`DS-ROLLBACK-${suffix}`);
        const input = { orderId, provider: "ghn", providerRequestKey: `delivery:${orderId}:1`,
            recipientName: "Nguyen Van A", recipientPhone: "0900000000", shippingAddress: "1 Test Street",
            provinceId: null, districtId: null, wardCode: null, codAmount: "100.0000" };
        await expect(createSalesV2Persistence(db).inTransaction(async (transaction) => {
            const repository = new SequelizeDeliveryShipmentV2Repository(createSalesV2Persistence(db), transaction);
            expect((await repository.create({ ...input, orderId: serializeEntityId(input.orderId),
                codAmount: serializeMoney(input.codAmount) })).kind).toBe("created");
            throw new Error("Rollback delivery shipment fixture.");
        })).rejects.toThrow("Rollback delivery shipment fixture.");
        expect(Number((await one<{ n: string }>("SELECT COUNT(*) AS n FROM shipments WHERE order_id = ?", [orderId])).n)).toBe(0);
    });
});
