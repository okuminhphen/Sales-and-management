import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize, type Transaction } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 fulfillment on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(
            env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD,
            { host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false },
        );
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    const insert = async (sql: string, values: Array<string | number | null>, transaction: Transaction) => {
        const [id] = await sequelize.query(sql, {
            replacements: values, transaction, type: QueryTypes.INSERT,
        });
        return String(id);
    };

    const seedOrder = async (transaction: Transaction) => {
        const token = randomUUID().slice(0, 8);
        const accountId = await insert(
            "INSERT INTO `accounts` (`email`, `status`, `created_at`, `updated_at`) VALUES (?, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`fulfillment-${token}@example.invalid`], transaction,
        );
        const customerId = await insert(
            "INSERT INTO `customers` (`account_id`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [accountId], transaction,
        );
        const branchId = await insert(
            "INSERT INTO `branches` (`code`, `name`, `address`, `created_at`, `updated_at`) VALUES (?, 'Fulfillment test', 'Test address', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`FUL-${token}`], transaction,
        );
        const orderId = await insert(
            "INSERT INTO `orders` (`code`, `checkout_key`, `customer_id`, `fulfillment_branch_id`, `channel`, `fulfillment_type`, `subtotal_amount`, `total_amount`, `placed_at`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, 'online', 'delivery', '100.0000', '100.0000', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`ORDER-${token}`, `checkout-${randomUUID()}`, customerId, branchId], transaction,
        );
        const orderItemId = await insert(
            "INSERT INTO `order_items` (`order_id`, `sku_snapshot`, `product_name_snapshot`, `size_name_snapshot`, `unit_price`, `quantity`, `line_total`, `created_at`) VALUES (?, 'SKU-SNAPSHOT', 'Product snapshot', 'M', '100.0000', 1, '100.0000', UTC_TIMESTAMP())",
            [orderId], transaction,
        );
        const paymentMethodId = await insert(
            "INSERT INTO `payment_methods` (`code`, `name`, `created_at`, `updated_at`) VALUES (?, 'Fulfillment test', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`method-${token}`], transaction,
        );
        const paymentId = await insert(
            "INSERT INTO `payments` (`order_id`, `payment_method_id`, `provider`, `merchant_reference`, `amount`, `status`, `paid_at`, `created_at`, `updated_at`) VALUES (?, ?, 'fake', ?, '100.0000', 'completed', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [orderId, paymentMethodId, `merchant-${token}`], transaction,
        );
        return { token, accountId, branchId, orderId, orderItemId, paymentId };
    };

    it("creates five fulfillment tables with foreign keys", async () => {
        const tables = await sequelize.query<{ tableName: string }>(
            "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('shipments', 'shipment_events', 'returns', 'return_items', 'refunds')",
            { type: QueryTypes.SELECT },
        );
        expect(tables).toHaveLength(5);
        const expectedForeignKeys = { shipments: 1, shipment_events: 1, returns: 5, return_items: 2, refunds: 5 };
        for (const [table, count] of Object.entries(expectedForeignKeys)) {
            const foreignKeys = await sequelize.query<{ constraintName: string }>(
                "SELECT constraint_name AS constraintName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL",
                { replacements: [table], type: QueryTypes.SELECT },
            );
            expect(foreignKeys).toHaveLength(count);
        }
    });

    it("enforces shipment recipient, COD, delivery state and provider idempotency", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedOrder(transaction);
            const ship = (orderId: string, requestKey: string, providerOrderId: string) =>
                insert(
                    "INSERT INTO `shipments` (`order_id`, `provider`, `provider_request_key`, `provider_order_id`, `recipient_name`, `recipient_phone`, `shipping_address`, `status`, `cod_amount`, `delivered_at`, `created_at`, `updated_at`) VALUES (?, 'fake', ?, ?, 'Test recipient', '0900000000', 'Test address', 'pending', '0.0000', NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                    [orderId, requestKey, providerOrderId], transaction,
                );
            const shipmentId = await ship(references.orderId, `request-${references.token}`, `provider-${references.token}`);
            await expect(ship(references.orderId, `request-other-${references.token}`, `provider-other-${references.token}`)).rejects.toThrow();
            const secondOrder = await seedOrder(transaction);
            await expect(ship(secondOrder.orderId, `request-${references.token}`, `provider-2-${references.token}`)).rejects.toThrow();
            await expect(ship(secondOrder.orderId, `request-2-${references.token}`, `provider-${references.token}`)).rejects.toThrow();
            await expect(sequelize.query(
                "UPDATE `shipments` SET `recipient_name` = '   ' WHERE `id` = ?",
                { replacements: [shipmentId], transaction },
            )).rejects.toThrow();
            await expect(sequelize.query(
                "UPDATE `shipments` SET `cod_amount` = '-1.0000' WHERE `id` = ?",
                { replacements: [shipmentId], transaction },
            )).rejects.toThrow();
            await expect(sequelize.query(
                "UPDATE `shipments` SET `status` = 'delivered' WHERE `id` = ?",
                { replacements: [shipmentId], transaction },
            )).rejects.toThrow();
            const addEvent = (eventKey: string) => insert(
                "INSERT INTO `shipment_events` (`shipment_id`, `event_key`, `status`, `occurred_at`, `received_at`) VALUES (?, ?, 'booked', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [shipmentId, eventKey], transaction,
            );
            await addEvent("event-1");
            await expect(addEvent("event-1")).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces return item quantities and duplicate item protection", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedOrder(transaction);
            const returnId = await insert(
                "INSERT INTO `returns` (`code`, `request_key`, `order_id`, `receiving_branch_id`, `reason`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, 'Damaged', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [`RETURN-${references.token}`, `return-${references.token}`, references.orderId, references.branchId], transaction,
            );
            const addItem = (requested: number, approved: number, received: number, restocked: number, refund: string) => insert(
                "INSERT INTO `return_items` (`return_id`, `order_item_id`, `requested_quantity`, `approved_quantity`, `received_quantity`, `restocked_quantity`, `approved_refund_amount`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [returnId, references.orderItemId, requested, approved, received, restocked, refund], transaction,
            );
            await expect(addItem(1, 2, 0, 0, "0.0000")).rejects.toThrow();
            await expect(addItem(1, 1, 1, 2, "0.0000")).rejects.toThrow();
            await expect(addItem(1, 1, 1, 1, "-1.0000")).rejects.toThrow();
            await addItem(1, 1, 1, 1, "100.0000");
            await expect(addItem(1, 1, 1, 1, "100.0000")).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces refund money, completion timestamp and idempotency", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedOrder(transaction);
            const addRefund = (key: string, amount: string, status = "pending", completedAt: string | null = null) => insert(
                "INSERT INTO `refunds` (`payment_id`, `idempotency_key`, `amount`, `status`, `reason`, `completed_at`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, 'Customer return', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [references.paymentId, key, amount, status, completedAt], transaction,
            );
            await addRefund(`refund-${references.token}`, "20.0000");
            await expect(addRefund(`refund-${references.token}`, "20.0000")).rejects.toThrow();
            await expect(addRefund(`zero-${references.token}`, "0.0000")).rejects.toThrow();
            await expect(addRefund(`completed-${references.token}`, "20.0000", "completed")).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });
});
