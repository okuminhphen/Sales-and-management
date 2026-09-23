import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize, type Transaction } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 inventory on MySQL", () => {
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

    const seedReferences = async (transaction: Transaction) => {
        const token = randomUUID().slice(0, 8);
        const accountId = await insert(
            "INSERT INTO `accounts` (`email`, `status`, `created_at`, `updated_at`) VALUES (?, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`inventory-${token}@example.invalid`], transaction,
        );
        const branchId = await insert(
            "INSERT INTO `branches` (`code`, `name`, `address`, `created_at`, `updated_at`) VALUES (?, 'Source', 'Test address', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`SRC-${token}`], transaction,
        );
        const destinationBranchId = await insert(
            "INSERT INTO `branches` (`code`, `name`, `address`, `created_at`, `updated_at`) VALUES (?, 'Destination', 'Test address', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`DST-${token}`], transaction,
        );
        const categoryId = await insert(
            "INSERT INTO `categories` (`code`, `name`, `slug`, `created_at`, `updated_at`) VALUES (?, 'Inventory', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`CAT-${token}`, `inventory-${token}`], transaction,
        );
        const productId = await insert(
            "INSERT INTO `products` (`category_id`, `name`, `slug`, `base_price`, `created_at`, `updated_at`) VALUES (?, 'Inventory', ?, '100.0000', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [categoryId, `product-${token}`], transaction,
        );
        const sizeId = await insert(
            "INSERT INTO `sizes` (`name`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`SIZE-${token}`], transaction,
        );
        const variantId = await insert(
            "INSERT INTO `product_variants` (`product_id`, `size_id`, `sku`, `created_at`, `updated_at`) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [productId, sizeId, `SKU-${token}`], transaction,
        );
        const orderId = await insert(
            "INSERT INTO `orders` (`code`, `checkout_key`, `fulfillment_branch_id`, `created_by_account_id`, `channel`, `fulfillment_type`, `subtotal_amount`, `total_amount`, `placed_at`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, 'in_store', 'carry_out', '100.0000', '100.0000', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`ORDER-${token}`, `checkout-${randomUUID()}`, branchId, accountId], transaction,
        );
        const orderItemId = await insert(
            "INSERT INTO `order_items` (`order_id`, `sku_snapshot`, `product_name_snapshot`, `size_name_snapshot`, `unit_price`, `quantity`, `line_total`, `created_at`) VALUES (?, 'SKU', 'Product', 'M', '100.0000', 1, '100.0000', UTC_TIMESTAMP())",
            [orderId], transaction,
        );
        const requestId = await insert(
            "INSERT INTO `stock_requests` (`code`, `from_branch_id`, `to_branch_id`, `created_by_account_id`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`REQUEST-${token}`, destinationBranchId, branchId, accountId], transaction,
        );
        const transferId = await insert(
            "INSERT INTO `transfer_receipts` (`stock_request_id`, `code`, `from_branch_id`, `to_branch_id`, `created_by_account_id`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [requestId, `TRANSFER-${token}`, branchId, destinationBranchId, accountId], transaction,
        );
        const transferItemId = await insert(
            "INSERT INTO `transfer_receipt_items` (`transfer_receipt_id`, `product_variant_id`, `quantity`, `created_at`, `updated_at`) VALUES (?, ?, 3, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [transferId, variantId], transaction,
        );
        const inventoryId = await insert(
            "INSERT INTO `inventories` (`branch_id`, `product_variant_id`, `stock`, `created_at`, `updated_at`) VALUES (?, ?, 3, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [branchId, variantId], transaction,
        );
        return { token, accountId, branchId, destinationBranchId, variantId, orderItemId, transferItemId, inventoryId };
    };

    it("creates nine tables and 28 typed foreign keys", async () => {
        const tables = await sequelize.query<{ tableName: string }>(
            "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('inventories', 'inventory_reservations', 'inventory_movements', 'stock_requests', 'stock_request_items', 'stock_request_history', 'transfer_receipts', 'transfer_receipt_items', 'transfer_history')",
            { type: QueryTypes.SELECT },
        );
        expect(tables).toHaveLength(9);
        const foreignKeys = await sequelize.query<{ constraintName: string }>(
            "SELECT constraint_name AS constraintName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name IN ('inventories', 'inventory_reservations', 'inventory_movements', 'stock_requests', 'stock_request_items', 'stock_request_history', 'transfer_receipts', 'transfer_receipt_items', 'transfer_history') AND referenced_table_name IS NOT NULL",
            { type: QueryTypes.SELECT },
        );
        expect(foreignKeys).toHaveLength(28);
    });

    it("enforces stock, reservation owner XOR, positive quantity and idempotency", async () => {
        const transaction = await sequelize.transaction();
        try {
            const ref = await seedReferences(transaction);
            await expect(sequelize.query(
                "UPDATE `inventories` SET `stock` = -1 WHERE `id` = ?",
                { replacements: [ref.inventoryId], transaction },
            )).rejects.toThrow();
            const reserve = (orderItemId: string | null, transferItemId: string | null, quantity: number, key: string) => insert(
                "INSERT INTO `inventory_reservations` (`inventory_id`, `order_item_id`, `transfer_receipt_item_id`, `quantity`, `idempotency_key`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [ref.inventoryId, orderItemId, transferItemId, quantity, key], transaction,
            );
            await expect(reserve(null, null, 1, `none-${ref.token}`)).rejects.toThrow();
            await expect(reserve(ref.orderItemId, ref.transferItemId, 1, `both-${ref.token}`)).rejects.toThrow();
            await expect(reserve(ref.orderItemId, null, 0, `zero-${ref.token}`)).rejects.toThrow();
            await reserve(ref.orderItemId, null, 1, `hold-${ref.token}`);
            await expect(reserve(null, ref.transferItemId, 1, `hold-${ref.token}`)).rejects.toThrow();
            await reserve(null, ref.transferItemId, 1, `transfer-hold-${ref.token}`);
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces transfer quantities, distinct branches and movement source", async () => {
        const transaction = await sequelize.transaction();
        try {
            const ref = await seedReferences(transaction);
            await expect(sequelize.query(
                "UPDATE `transfer_receipt_items` SET `received_quantity` = 4 WHERE `id` = ?",
                { replacements: [ref.transferItemId], transaction },
            )).rejects.toThrow();
            await expect(insert(
                "INSERT INTO `stock_requests` (`code`, `from_branch_id`, `to_branch_id`, `created_by_account_id`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [`BAD-${ref.token}`, ref.branchId, ref.branchId, ref.accountId], transaction,
            )).rejects.toThrow();
            const movement = (delta: number, orderItemId: string | null, transferItemId: string | null, key: string) => insert(
                "INSERT INTO `inventory_movements` (`branch_id`, `product_variant_id`, `quantity_delta`, `balance_after`, `order_item_id`, `transfer_receipt_item_id`, `reason`, `reference_type`, `reference_id`, `idempotency_key`, `occurred_at`, `created_at`) VALUES (?, ?, ?, 2, ?, ?, 'sale', 'order', 'test', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [ref.branchId, ref.variantId, delta, orderItemId, transferItemId, key], transaction,
            );
            await expect(movement(0, ref.orderItemId, null, `zero-${ref.token}`)).rejects.toThrow();
            await expect(movement(-1, ref.orderItemId, ref.transferItemId, `both-${ref.token}`)).rejects.toThrow();
            await movement(-1, ref.orderItemId, null, `sale-${ref.token}`);
            await expect(movement(-1, ref.orderItemId, null, `sale-${ref.token}`)).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });
});
