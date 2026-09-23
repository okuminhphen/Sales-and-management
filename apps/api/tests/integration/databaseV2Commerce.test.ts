import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize, type Transaction } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 commerce on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(
            env.V2_MIGRATIONS_TARGET_DATABASE,
            env.MYSQL_USER,
            env.MYSQL_PASSWORD,
            {
                host: env.MYSQL_HOST,
                port: env.MYSQL_PORT,
                dialect: "mysql",
                logging: false,
            },
        );
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    const insert = async (
        sql: string,
        values: Array<string | number>,
        transaction: Transaction,
    ): Promise<string> => {
        const [id] = await sequelize.query(sql, {
            replacements: values,
            transaction,
            type: QueryTypes.INSERT,
        });
        return String(id);
    };

    const seedReferences = async (transaction: Transaction) => {
        const token = randomUUID().slice(0, 8);
        const accountId = await insert(
            "INSERT INTO `accounts` (`email`, `status`, `created_at`, `updated_at`) VALUES (?, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`v2-test-${token}@example.invalid`],
            transaction,
        );
        const customerId = await insert(
            "INSERT INTO `customers` (`account_id`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [accountId],
            transaction,
        );
        const branchId = await insert(
            "INSERT INTO `branches` (`code`, `name`, `address`, `created_at`, `updated_at`) VALUES (?, 'V2 test', 'Test address', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`V2-${token}`],
            transaction,
        );
        const categoryId = await insert(
            "INSERT INTO `categories` (`code`, `name`, `slug`, `created_at`, `updated_at`) VALUES (?, 'V2 test', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`CAT-${token}`, `category-${token}`],
            transaction,
        );
        const productId = await insert(
            "INSERT INTO `products` (`category_id`, `name`, `slug`, `base_price`, `created_at`, `updated_at`) VALUES (?, 'V2 test', ?, '100.0000', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [categoryId, `product-${token}`],
            transaction,
        );
        const sizeId = await insert(
            "INSERT INTO `sizes` (`name`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`SIZE-${token}`],
            transaction,
        );
        const variantId = await insert(
            "INSERT INTO `product_variants` (`product_id`, `size_id`, `sku`, `created_at`, `updated_at`) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [productId, sizeId, `SKU-${token}`],
            transaction,
        );
        return { token, accountId, customerId, branchId, productId, variantId };
    };

    const insertOrder = async (
        transaction: Transaction,
        references: Awaited<ReturnType<typeof seedReferences>>,
        amount: string,
        checkoutKey = `checkout-${randomUUID()}`,
    ): Promise<string> =>
        insert(
            `INSERT INTO \`orders\` (
                \`code\`, \`checkout_key\`, \`customer_id\`, \`fulfillment_branch_id\`,
                \`channel\`, \`fulfillment_type\`, \`subtotal_amount\`, \`discount_amount\`,
                \`shipping_fee\`, \`total_amount\`, \`placed_at\`, \`created_at\`, \`updated_at\`
            ) VALUES (?, ?, ?, ?, 'online', 'delivery', '100.0000', '10.0000', '5.0000', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
            [`ORDER-${randomUUID().slice(0, 8)}`, checkoutKey, references.customerId, references.branchId, amount],
            transaction,
        );

    it("creates the 11 commerce tables and the deferred review/order item FK", async () => {
        const tables = await sequelize.query<{ tableName: string }>(
            `SELECT table_name AS tableName FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name IN
             ('carts', 'cart_items', 'orders', 'order_items', 'order_status_history',
              'vouchers', 'voucher_branches', 'voucher_redemptions',
              'payment_methods', 'payments', 'payment_events')`,
            { type: QueryTypes.SELECT },
        );
        expect(tables).toHaveLength(11);
        const reviewForeignKeys = await sequelize
            .getQueryInterface()
            .getForeignKeyReferencesForTable("reviews");
        expect(reviewForeignKeys).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    columnName: "order_item_id",
                    referencedTableName: "order_items",
                }),
            ]),
        );
    });

    it("accepts exact DECIMAL totals and a complete order item snapshot", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedReferences(transaction);
            const orderId = await insertOrder(transaction, references, "95.0000");
            const itemId = await insert(
                `INSERT INTO \`order_items\` (
                    \`order_id\`, \`product_id\`, \`product_variant_id\`, \`sku_snapshot\`,
                    \`product_name_snapshot\`, \`size_name_snapshot\`, \`unit_price\`,
                    \`discount_amount\`, \`quantity\`, \`line_total\`, \`created_at\`
                ) VALUES (?, ?, ?, 'SKU-SNAPSHOT', 'Product snapshot', 'M', '100.0000', '10.0000', 1, '90.0000', UTC_TIMESTAMP())`,
                [orderId, references.productId, references.variantId],
                transaction,
            );
            const rows = await sequelize.query<{ total_amount: string; line_total: string }>(
                `SELECT o.total_amount, i.line_total FROM \`orders\` o
                 JOIN \`order_items\` i ON i.order_id = o.id WHERE i.id = ?`,
                { replacements: [itemId], transaction, type: QueryTypes.SELECT },
            );
            expect(rows).toEqual([{ total_amount: "95.0000", line_total: "90.0000" }]);
        } finally {
            await transaction.rollback();
        }
    });

    it("rejects invalid money identity and duplicate checkout keys", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedReferences(transaction);
            const checkoutKey = `checkout-${randomUUID()}`;
            await insertOrder(transaction, references, "95.0000", checkoutKey);
            await expect(insertOrder(transaction, references, "96.0000")).rejects.toThrow();
            await expect(
                insertOrder(transaction, references, "95.0000", checkoutKey),
            ).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces cart quantity and one variant per cart", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedReferences(transaction);
            const cartId = await insert(
                "INSERT INTO `carts` (`customer_id`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [references.customerId],
                transaction,
            );
            await insert(
                "INSERT INTO `cart_items` (`cart_id`, `product_variant_id`, `quantity`, `created_at`, `updated_at`) VALUES (?, ?, 2, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [cartId, references.variantId],
                transaction,
            );
            await expect(insert(
                "INSERT INTO `cart_items` (`cart_id`, `product_variant_id`, `quantity`, `created_at`, `updated_at`) VALUES (?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [cartId, references.variantId],
                transaction,
            )).rejects.toThrow();
            await expect(insert(
                "INSERT INTO `cart_items` (`cart_id`, `product_variant_id`, `quantity`, `created_at`, `updated_at`) VALUES (?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [cartId, references.variantId],
                transaction,
            )).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces payment amount and provider idempotency keys", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedReferences(transaction);
            const orderId = await insertOrder(transaction, references, "95.0000");
            const methodId = await insert(
                "INSERT INTO `payment_methods` (`code`, `name`, `created_at`, `updated_at`) VALUES (?, 'V2 test', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [`method-${references.token}`],
                transaction,
            );
            const insertPayment = (merchantReference: string, providerTransactionId: string, amount: string) =>
                insert(
                    "INSERT INTO `payments` (`order_id`, `payment_method_id`, `provider`, `merchant_reference`, `provider_transaction_id`, `amount`, `created_at`, `updated_at`) VALUES (?, ?, 'fake_provider', ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                    [orderId, methodId, merchantReference, providerTransactionId, amount],
                    transaction,
                );
            const paymentId = await insertPayment("merchant-a", "transaction-a", "95.0000");
            await expect(insertPayment("merchant-b", "transaction-b", "0.0000")).rejects.toThrow();
            await expect(insertPayment("merchant-a", "transaction-c", "95.0000")).rejects.toThrow();
            await expect(insertPayment("merchant-c", "transaction-a", "95.0000")).rejects.toThrow();

            const insertEvent = (eventKey: string) => insert(
                "INSERT INTO `payment_events` (`payment_id`, `provider`, `event_key`, `event_type`, `verified_at`, `created_at`) VALUES (?, 'fake_provider', ?, 'paid', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [paymentId, eventKey],
                transaction,
            );
            await insertEvent("event-a");
            await expect(insertEvent("event-a")).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces voucher limits, dates, and one redemption per order", async () => {
        const transaction = await sequelize.transaction();
        try {
            const references = await seedReferences(transaction);
            const orderId = await insertOrder(transaction, references, "95.0000");
            const insertVoucher = (code: string, value: string, endOffsetDays: number) => insert(
                "INSERT INTO `vouchers` (`code`, `discount_type`, `discount_value`, `starts_at`, `ends_at`, `created_at`, `updated_at`) VALUES (?, 'percent', ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [code, value, endOffsetDays],
                transaction,
            );
            const voucherId = await insertVoucher(`voucher-${references.token}`, "10.0000", 1);
            await expect(insertVoucher(`voucher-bad-${references.token}`, "101.0000", 1)).rejects.toThrow();
            await expect(insertVoucher(`voucher-date-${references.token}`, "10.0000", -1)).rejects.toThrow();
            const redeem = () => insert(
                "INSERT INTO `voucher_redemptions` (`voucher_id`, `order_id`, `customer_id`, `voucher_code_snapshot`, `discount_amount`, `reserved_at`) VALUES (?, ?, ?, 'VOUCHER-SNAPSHOT', '10.0000', UTC_TIMESTAMP())",
                [voucherId, orderId, references.customerId],
                transaction,
            );
            await redeem();
            await expect(redeem()).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });
});
