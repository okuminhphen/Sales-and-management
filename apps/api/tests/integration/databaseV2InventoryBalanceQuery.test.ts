import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { InventoryBalanceV2Service } from "../../src/modules/inventory-transfer/application/inventory-balance-v2.service.js";
import { SequelizeInventoryBalanceV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-balance-v2.repository.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Database V2 inventory balance query on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw Error("An explicit _test database is required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => { await sequelize?.close(); });

    it("subtracts only active holds, including expired-but-unreleased holds", async () => {
        const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
        const insert = async (sql: string, replacements: unknown[]): Promise<string> => {
            const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
            return String(id);
        };
        const accountId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`balance-${suffix}@example.invalid`]);
        const branchId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Balance', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`BAL-${suffix}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Balance', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`BALCAT-${suffix}`, `balcat-${suffix}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, created_at, updated_at) VALUES (?, 'Balance', ?, '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `balance-${suffix}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`BALSIZE-${suffix}`]);
        const variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `BALSKU-${suffix}`]);
        const inventoryId = await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 5, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [branchId, variantId]);
        const orderId = await insert("INSERT INTO orders (code, checkout_key, fulfillment_branch_id, created_by_account_id, channel, fulfillment_type, subtotal_amount, total_amount, placed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_store', 'carry_out', '100.0000', '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`BALORD-${suffix}`, `balcheckout-${suffix}`, branchId, accountId]);
        const orderItemId = await insert("INSERT INTO order_items (order_id, product_variant_id, sku_snapshot, product_name_snapshot, size_name_snapshot, unit_price, quantity, line_total, created_at) VALUES (?, ?, 'SKU', 'Product', 'M', '100.0000', 1, '100.0000', UTC_TIMESTAMP(3))", [orderId, variantId]);
        const hold = async (quantity: number, status: string, key: string, expiresAt: string | null) => insert(
            "INSERT INTO inventory_reservations (inventory_id, order_item_id, quantity, status, expires_at, released_at, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, IF(? = 'released', UTC_TIMESTAMP(3), NULL), ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            [inventoryId, orderItemId, quantity, status, expiresAt, status, key],
        );
        await hold(2, "active", `active-${suffix}`, "2020-01-01 00:00:00");
        await hold(1, "released", `released-${suffix}`, null);
        const service = new InventoryBalanceV2Service({ repository: new SequelizeInventoryBalanceV2Repository(createSalesV2Persistence(sequelize)) });
        expect(await service.get(branchId, variantId)).toEqual({
            kind: "balance", balance: { branchId, productVariantId: variantId, stock: 5, reserved: 2, available: 3 },
        });
        expect(await service.get(branchId, "999999999999999999")).toEqual({ kind: "inventory_not_found" });
    });
});
