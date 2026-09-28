import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { serializeDatabaseEntityId } from "../../src/shared/contracts/database-scalars.js";
import { SequelizeVoucherDirectoryV2Repository } from "../../src/modules/commerce/persistence/voucher-directory-v2.repository.js";
import { SequelizeBehaviorV2Repository } from "../../src/modules/communication-ai/persistence/behavior-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 closure features on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST,
            port: env.MYSQL_PORT,
            dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
            logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("lists only currently usable online vouchers while preserving decimal money", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
        const activeCode = `ACTIVE_${suffix}`;
        const inStoreCode = `STORE_${suffix}`;
        await sequelize.query(
            `INSERT INTO vouchers
                (code, description, discount_type, discount_value, min_order_amount,
                 max_discount_amount, usage_limit, per_customer_limit, applies_to_channel,
                 branch_scope, starts_at, ends_at, status, created_at, updated_at)
             VALUES
                (?, 'Online integration voucher', 'fixed', '25000.0000', '100000.0000',
                 NULL, 3, 1, 'online', 'all', UTC_TIMESTAMP(3) - INTERVAL 1 HOUR,
                 UTC_TIMESTAMP(3) + INTERVAL 1 DAY, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
                (?, 'Store-only integration voucher', 'percent', '10.0000', '0.0000',
                 '50000.0000', NULL, NULL, 'in_store', 'all', UTC_TIMESTAMP(3) - INTERVAL 1 HOUR,
                 UTC_TIMESTAMP(3) + INTERVAL 1 DAY, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [activeCode, inStoreCode], type: QueryTypes.INSERT },
        );

        const vouchers = await new SequelizeVoucherDirectoryV2Repository(createSalesV2Persistence(sequelize))
            .listActiveOnlineVouchers();
        expect(vouchers).toContainEqual(expect.objectContaining({
            code: activeCode,
            discountType: "fixed",
            discountValue: "25000.0000",
            minOrderAmount: "100000.0000",
            maxDiscountAmount: null,
            remainingUses: 3,
        }));
        expect(vouchers.some((voucher) => voucher.code === inStoreCode)).toBe(false);
    });

    it("persists authenticated product views and like toggles as events plus a projection", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        await sequelize.query(
            `INSERT INTO accounts
                (email, username, password_hash, status, email_verified_at, last_login_at, created_at, updated_at)
             VALUES (?, ?, NULL, 'active', UTC_TIMESTAMP(3), NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [`behavior-${suffix}@example.test`, `behavior-${suffix}`], type: QueryTypes.INSERT },
        );
        const [{ id: accountId }] = await sequelize.query<{ id: string }>(
            "SELECT id FROM accounts WHERE email = ?",
            { replacements: [`behavior-${suffix}@example.test`], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            `INSERT INTO customers (account_id, full_name, phone, status, loyalty_points, created_at, updated_at)
             VALUES (?, 'Behavior customer', NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [accountId], type: QueryTypes.INSERT },
        );
        const [{ id: customerId }] = await sequelize.query<{ id: string }>(
            "SELECT id FROM customers WHERE account_id = ?",
            { replacements: [accountId], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            `INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at)
             VALUES (NULL, ?, 'Behavior category', ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [`BEHAVIOR_${suffix}`, `behavior-${suffix}`], type: QueryTypes.INSERT },
        );
        const [{ id: categoryId }] = await sequelize.query<{ id: string }>(
            "SELECT id FROM categories WHERE code = ?",
            { replacements: [`BEHAVIOR_${suffix}`], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            `INSERT INTO products
                (category_id, name, slug, description, base_price, images, status, created_at, updated_at)
             VALUES (?, 'Behavior product', ?, NULL, '99000.0000', NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [categoryId, `behavior-product-${suffix}`], type: QueryTypes.INSERT },
        );
        const [{ id: productId }] = await sequelize.query<{ id: string }>(
            "SELECT id FROM products WHERE slug = ?",
            { replacements: [`behavior-product-${suffix}`], type: QueryTypes.SELECT },
        );

        const customerEntityId = serializeDatabaseEntityId(customerId);
        const productEntityId = serializeDatabaseEntityId(productId);
        const repository = new SequelizeBehaviorV2Repository(createSalesV2Persistence(sequelize));
        await expect(repository.recordView(customerEntityId, productEntityId)).resolves.toBe(true);
        await expect(repository.recordView(customerEntityId, productEntityId)).resolves.toBe(true);
        await expect(repository.toggleLike(customerEntityId, productEntityId)).resolves.toBe(true);
        await expect(repository.getLikeStatus(customerEntityId, productEntityId)).resolves.toBe(true);

        const [projection] = await sequelize.query<{ viewCount: number; isLiked: number | boolean }>(
            `SELECT view_count AS viewCount, is_liked AS isLiked
             FROM customer_product_stats WHERE customer_id = ? AND product_id = ?`,
            { replacements: [customerId, productId], type: QueryTypes.SELECT },
        );
        const [events] = await sequelize.query<{ count: number | string }>(
            "SELECT COUNT(*) AS count FROM behavior_events WHERE customer_id = ? AND product_id = ?",
            { replacements: [customerId, productId], type: QueryTypes.SELECT },
        );
        expect(Number(projection?.viewCount)).toBe(2);
        expect(projection?.isLiked === true || projection?.isLiked === 1).toBe(true);
        expect(Number(events?.count)).toBe(3);
    });
});
