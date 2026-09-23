import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { CartMutationV2Service } from "../../src/modules/commerce/application/cart-mutation-v2.service.js";
import { SequelizeCartMutationV2Repository } from "../../src/modules/commerce/persistence/cart-mutation-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 cart mutation on MySQL", () => {
    let sequelize: Sequelize;
    let service: CartMutationV2Service;
    let owner: V2AccessContext;
    let other: V2AccessContext;
    let activeVariantId: string;
    let inactiveVariantId: string;

    const one = async <Row extends object>(sql: string, replacements: unknown[]): Promise<Row> => {
        const rows = await sequelize.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing cart mutation fixture row.");
        return rows[0];
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        service = new CartMutationV2Service({
            repository: new SequelizeCartMutationV2Repository(createSalesV2Persistence(sequelize)),
        });
    });

    beforeEach(async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        await sequelize.query(
            "INSERT INTO customers (account_id, full_name, phone, status, loyalty_points, created_at, updated_at) VALUES (NULL, ?, NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (NULL, ?, NULL, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`Mutation owner ${suffix}`, `Mutation other ${suffix}`] },
        );
        const ownerRow = await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [`Mutation owner ${suffix}`]);
        const otherRow = await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [`Mutation other ${suffix}`]);
        owner = { accountId: "1", customerId: ownerRow.id, employeeId: null, grants: [] };
        other = { accountId: "2", customerId: otherRow.id, employeeId: null, grants: [] };
        await sequelize.query(
            "INSERT INTO categories (parent_id, code, name, slug, description, created_at, updated_at) VALUES (NULL, ?, 'Mutation test', ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`MUT_${suffix}`, `mutation-${suffix}`] },
        );
        const category = await one<{ id: string }>("SELECT id FROM categories WHERE code = ?", [`MUT_${suffix}`]);
        await sequelize.query(
            "INSERT INTO products (category_id, name, slug, description, base_price, images, status, created_at, updated_at) VALUES (?, 'Mutation product', ?, NULL, '50.0000', NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [category.id, `mutation-product-${suffix}`] },
        );
        const product = await one<{ id: string }>("SELECT id FROM products WHERE slug = ?", [`mutation-product-${suffix}`]);
        await sequelize.query(
            "INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [`Mutation active ${suffix}`, `Mutation inactive ${suffix}`] },
        );
        const activeSize = await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`Mutation active ${suffix}`]);
        const inactiveSize = await one<{ id: string }>("SELECT id FROM sizes WHERE name = ?", [`Mutation inactive ${suffix}`]);
        await sequelize.query(
            "INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)), (?, ?, ?, 'inactive', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [product.id, activeSize.id, `MUT-A-${suffix}`, product.id, inactiveSize.id, `MUT-I-${suffix}`] },
        );
        activeVariantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [`MUT-A-${suffix}`])).id;
        inactiveVariantId = (await one<{ id: string }>("SELECT id FROM product_variants WHERE sku = ?", [`MUT-I-${suffix}`])).id;
    });

    afterAll(async () => { await sequelize?.close(); });

    it("does not create a cart for inactive or unknown variants", async () => {
        await expect(service.add(owner, { productVariantId: inactiveVariantId, quantity: 1 }))
            .resolves.toEqual({ kind: "variant_unavailable" });
        await expect(service.add(owner, { productVariantId: "9223372036854775807", quantity: 1 }))
            .resolves.toEqual({ kind: "variant_unavailable" });
        const count = await one<{ total: number }>("SELECT COUNT(*) AS total FROM carts WHERE customer_id = ?", [owner.customerId]);
        expect(Number(count.total)).toBe(0);
    });

    it("serializes concurrent adds, preserves owner isolation and rejects INT overflow", async () => {
        const results = await Promise.all([
            service.add(owner, { productVariantId: activeVariantId, quantity: 2 }),
            service.add(owner, { productVariantId: activeVariantId, quantity: 3 }),
            service.add(owner, { productVariantId: activeVariantId, quantity: 4 }),
        ]);
        expect(results.every((result) => result.kind === "added")).toBe(true);
        const rows = await sequelize.query<{ quantity: number }>(
            "SELECT cart_items.quantity FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE carts.customer_id = ? AND cart_items.product_variant_id = ?",
            { replacements: [owner.customerId, activeVariantId], type: QueryTypes.SELECT },
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.quantity).toBe(9);
        await expect(service.add(owner, { productVariantId: activeVariantId, quantity: 2_147_483_639 }))
            .resolves.toEqual({ kind: "quantity_limit_exceeded" });
        await expect(service.add(other, { productVariantId: activeVariantId, quantity: 1 }))
            .resolves.toEqual({ kind: "added", quantity: 1 });
        const ownerQuantity = await one<{ quantity: number }>(
            "SELECT cart_items.quantity FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE carts.customer_id = ?",
            [owner.customerId],
        );
        expect(ownerQuantity.quantity).toBe(9);
        await sequelize.query("UPDATE product_variants SET status = 'inactive' WHERE id = ?", {
            replacements: [activeVariantId],
        });
        await expect(service.add(owner, { productVariantId: activeVariantId, quantity: 1 }))
            .resolves.toEqual({ kind: "variant_unavailable" });
        const unchanged = await one<{ quantity: number }>(
            "SELECT cart_items.quantity FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE carts.customer_id = ?",
            [owner.customerId],
        );
        expect(unchanged.quantity).toBe(9);
    });

    it("updates quantity only for owner and refuses a product that became inactive", async () => {
        await expect(service.add(owner, { productVariantId: activeVariantId, quantity: 2 }))
            .resolves.toEqual({ kind: "added", quantity: 2 });
        const item = await one<{ id: string }>(
            "SELECT cart_items.id FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE carts.customer_id = ?",
            [owner.customerId],
        );
        await expect(service.update(other, { cartItemId: item.id, quantity: 5 }))
            .resolves.toEqual({ kind: "item_not_found" });
        await expect(service.update(owner, { cartItemId: item.id, quantity: 5 }))
            .resolves.toEqual({ kind: "updated", quantity: 5 });
        await expect(service.update(owner, { cartItemId: item.id, quantity: 5 }))
            .resolves.toEqual({ kind: "updated", quantity: 5 });
        const persisted = await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE id = ?", [item.id]);
        expect(persisted.quantity).toBe(5);
        await sequelize.query(
            "UPDATE products JOIN product_variants ON product_variants.product_id = products.id SET products.status = 'inactive' WHERE product_variants.id = ?",
            { replacements: [activeVariantId] },
        );
        await expect(service.update(owner, { cartItemId: item.id, quantity: 6 }))
            .resolves.toEqual({ kind: "variant_unavailable" });
        const unchanged = await one<{ quantity: number }>("SELECT quantity FROM cart_items WHERE id = ?", [item.id]);
        expect(unchanged.quantity).toBe(5);
    });

    it("removes only an owned item and treats foreign/missing IDs alike", async () => {
        await expect(service.add(owner, { productVariantId: activeVariantId, quantity: 2 }))
            .resolves.toEqual({ kind: "added", quantity: 2 });
        const item = await one<{ id: string }>(
            "SELECT cart_items.id FROM cart_items JOIN carts ON carts.id = cart_items.cart_id WHERE carts.customer_id = ?",
            [owner.customerId],
        );
        await expect(service.remove(other, { cartItemId: item.id }))
            .resolves.toEqual({ kind: "item_not_found" });
        await expect(service.remove(owner, { cartItemId: item.id }))
            .resolves.toEqual({ kind: "removed" });
        await expect(service.remove(owner, { cartItemId: item.id }))
            .resolves.toEqual({ kind: "item_not_found" });
        const count = await one<{ total: number }>(
            "SELECT COUNT(*) AS total FROM cart_items WHERE id = ?", [item.id],
        );
        expect(Number(count.total)).toBe(0);
    });
});
