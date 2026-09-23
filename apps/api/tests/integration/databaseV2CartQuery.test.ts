import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CartQueryV2Service } from "../../src/modules/commerce/application/cart-query-v2.service.js";
import { SequelizeCartQueryV2Repository } from "../../src/modules/commerce/persistence/cart-query-v2.repository.js";
import { SequelizeCartVariantV2Resolver } from "../../src/modules/commerce/persistence/cart-variant-v2.resolver.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 own-cart read on MySQL", () => {
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

    it("isolates customer carts and exposes catalog status without claiming stock availability", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const ownerName = `Cart owner ${suffix}`;
        const otherName = `Other cart owner ${suffix}`;
        await sequelize.query(
            "INSERT INTO customers (account_id, full_name, phone, status, loyalty_points, created_at, updated_at) VALUES (NULL, ?, NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (NULL, ?, NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [ownerName, otherName], type: QueryTypes.INSERT },
        );
        const customers = await sequelize.query<{ id: string; fullName: string }>(
            "SELECT id, full_name AS fullName FROM customers WHERE full_name IN (?, ?)",
            { replacements: [ownerName, otherName], type: QueryTypes.SELECT },
        );
        const ownerId = customers.find((customer) => customer.fullName === ownerName)!.id;
        const otherId = customers.find((customer) => customer.fullName === otherName)!.id;
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, 'Cart test', ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`CART_${suffix}`, `cart-${suffix}`], type: QueryTypes.INSERT },
        );
        const category = await sequelize.query<{ id: string }>(
            "SELECT id FROM categories WHERE code = ?",
            { replacements: [`CART_${suffix}`], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            "INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, 'Cart test product', ?, NULL, '1299000.0000', ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [category[0]!.id, `cart-product-${suffix}`, JSON.stringify([
                { url: "https://example.com/cart.jpg", secret: "hidden" },
                { url: "javascript:alert(1)" },
            ])], type: QueryTypes.INSERT },
        );
        const product = await sequelize.query<{ id: string }>(
            "SELECT id FROM products WHERE slug = ?",
            { replacements: [`cart-product-${suffix}`], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            "INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`Cart active ${suffix}`, `Cart inactive ${suffix}`], type: QueryTypes.INSERT },
        );
        const sizes = await sequelize.query<{ id: string; name: string }>(
            "SELECT id, name FROM sizes WHERE name IN (?, ?)",
            { replacements: [`Cart active ${suffix}`, `Cart inactive ${suffix}`], type: QueryTypes.SELECT },
        );
        const activeSizeId = sizes.find((size) => size.name === `Cart active ${suffix}`)!.id;
        const inactiveSizeId = sizes.find((size) => size.name === `Cart inactive ${suffix}`)!.id;
        await sequelize.query(
            "INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, ?, 'inactive', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            {
                replacements: [product[0]!.id, activeSizeId, `CART-A-${suffix}`, product[0]!.id, inactiveSizeId, `CART-I-${suffix}`],
                type: QueryTypes.INSERT,
            },
        );
        const variants = await sequelize.query<{ id: string; sizeId: string }>(
            "SELECT id, size_id AS sizeId FROM product_variants WHERE sku IN (?, ?)",
            { replacements: [`CART-A-${suffix}`, `CART-I-${suffix}`], type: QueryTypes.SELECT },
        );
        const activeVariantId = variants.find((variant) => variant.sizeId === activeSizeId)!.id;
        const inactiveVariantId = variants.find((variant) => variant.sizeId === inactiveSizeId)!.id;
        await sequelize.query(
            "INSERT INTO carts (customer_id, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [ownerId, otherId], type: QueryTypes.INSERT },
        );
        const carts = await sequelize.query<{ id: string; customerId: string }>(
            "SELECT id, customer_id AS customerId FROM carts WHERE customer_id IN (?, ?)",
            { replacements: [ownerId, otherId], type: QueryTypes.SELECT },
        );
        const ownerCartId = carts.find((cart) => cart.customerId === ownerId)!.id;
        const otherCartId = carts.find((cart) => cart.customerId === otherId)!.id;
        await sequelize.query(
            "INSERT INTO cart_items (cart_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 2, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, 9, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [ownerCartId, activeVariantId, ownerCartId, inactiveVariantId, otherCartId, activeVariantId], type: QueryTypes.INSERT },
        );

        const context: V2AccessContext = { accountId: "1", customerId: ownerId, employeeId: null, grants: [] };
        const service = new CartQueryV2Service({
            repository: new SequelizeCartQueryV2Repository(createSalesV2Persistence(sequelize)),
        });
        const result = await service.getOwnCart(context);

        expect(result).toMatchObject({ kind: "cart", page: { totalItems: 2, limit: 20 } });
        if (result.kind !== "cart") return;
        expect(result.page.items).toEqual(expect.arrayContaining([
            expect.objectContaining({ productVariantId: activeVariantId, quantity: 2, catalogActive: true,
                unitPrice: "1299000.0000", images: [{ url: "https://example.com/cart.jpg" }] }),
            expect.objectContaining({ productVariantId: inactiveVariantId, quantity: 1, catalogActive: false }),
        ]));
        expect(result.page.items.some((item) => item.quantity === 9)).toBe(false);

        const resolver = new SequelizeCartVariantV2Resolver(createSalesV2Persistence(sequelize));
        await expect(resolver.findActiveId(serializeEntityId(product[0]!.id), serializeEntityId(activeSizeId)))
            .resolves.toBe(activeVariantId);
        await expect(resolver.findActiveId(serializeEntityId(product[0]!.id), serializeEntityId(inactiveSizeId)))
            .resolves.toBeNull();
    });
});
