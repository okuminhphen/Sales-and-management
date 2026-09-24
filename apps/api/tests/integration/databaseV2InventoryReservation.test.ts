import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { InventoryReservationV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-v2.service.js";
import { SequelizeInventoryReservationV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-reservation-v2.repository.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Database V2 inventory reservation on MySQL", () => {
    let sequelize: Sequelize;
    let service: InventoryReservationV2Service;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw Error("An explicit _test database is required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        service = new InventoryReservationV2Service({ repository: new SequelizeInventoryReservationV2Repository(createSalesV2Persistence(sequelize)) });
    });
    afterAll(async () => { await sequelize?.close(); });

    const insert = async (sql: string, replacements: unknown[]): Promise<string> => {
        const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
        return String(id);
    };
    const expiry = () => new Date(Math.ceil((Date.now() + 3_600_000) / 1000) * 1000);

    const fixture = async (stock: number) => {
        const token = randomUUID().replace(/-/g, "").slice(0, 12);
        const accountId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`reserve-${token}@example.invalid`]);
        const branchId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Reserve', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`RES-${token}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Reserve', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`RESCAT-${token}`, `rescat-${token}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, created_at, updated_at) VALUES (?, 'Reserve', ?, '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `resproduct-${token}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`RESSIZE-${token}`]);
        const variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `RESSKU-${token}`]);
        const inventoryId = await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [branchId, variantId, stock]);
        const createItem = async (number: number): Promise<string> => {
            const orderId = await insert("INSERT INTO orders (code, checkout_key, fulfillment_branch_id, created_by_account_id, channel, fulfillment_type, subtotal_amount, total_amount, placed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_store', 'carry_out', '100.0000', '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`RESORD-${number}-${token}`, `rescheckout-${number}-${token}`, branchId, accountId]);
            return insert("INSERT INTO order_items (order_id, product_variant_id, sku_snapshot, product_name_snapshot, size_name_snapshot, unit_price, quantity, line_total, created_at) VALUES (?, ?, 'SKU', 'Product', 'M', '100.0000', 1, '100.0000', UTC_TIMESTAMP(3))", [orderId, variantId]);
        };
        return { token, inventoryId, firstItemId: await createItem(1), secondItemId: await createItem(2) };
    };

    it("reserves once, replays the exact key and never changes physical stock", async () => {
        const data = await fixture(1);
        const expiresAt = expiry();
        const input = { orderItemId: data.firstItemId, idempotencyKey: `reserve-${data.token}`, expiresAt };
        const first = await service.reserveOrderItem(input);
        expect(first).toMatchObject({ kind: "reserved", quantity: 1 });
        const expiryRows = await sequelize.query<{ epoch: number }>(
            "SELECT UNIX_TIMESTAMP(expires_at) AS epoch FROM inventory_reservations WHERE idempotency_key = ?",
            { replacements: [input.idempotencyKey], type: QueryTypes.SELECT },
        );
        expect(Number(expiryRows[0]?.epoch)).toBe(expiresAt.getTime() / 1000);
        expect(await service.reserveOrderItem(input)).toEqual({ ...first, kind: "replayed" });
        expect(await service.reserveOrderItem({ ...input, expiresAt: new Date(expiresAt.getTime() + 1000) })).toEqual({ kind: "idempotency_conflict" });
        expect(await service.reserveOrderItem({ ...input, idempotencyKey: `other-${data.token}` })).toEqual({ kind: "already_reserved" });
        expect(await service.reserveOrderItem({ ...input, orderItemId: data.secondItemId })).toEqual({ kind: "idempotency_conflict" });
        expect(await service.reserveOrderItem({ ...input, orderItemId: data.secondItemId, idempotencyKey: `second-${data.token}` })).toEqual({ kind: "insufficient_stock" });
        const rows = await sequelize.query<{ stock: number; holds: string }>(
            "SELECT i.stock, (SELECT COUNT(*) FROM inventory_reservations r WHERE r.inventory_id = i.id AND r.status = 'active') AS holds FROM inventories i WHERE i.id = ?",
            { replacements: [data.inventoryId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ stock: 1, holds: "1" });
    });

    it("serializes competing checkouts for the last unit", async () => {
        const data = await fixture(1);
        const expiresAt = expiry();
        const results = await Promise.all([
            service.reserveOrderItem({ orderItemId: data.firstItemId, idempotencyKey: `race-a-${data.token}`, expiresAt }),
            service.reserveOrderItem({ orderItemId: data.secondItemId, idempotencyKey: `race-b-${data.token}`, expiresAt }),
        ]);
        expect(results.map((result) => result.kind).sort()).toEqual(["insufficient_stock", "reserved"]);
        const rows = await sequelize.query<{ holds: string }>(
            "SELECT COUNT(*) AS holds FROM inventory_reservations WHERE inventory_id = ? AND status = 'active'",
            { replacements: [data.inventoryId], type: QueryTypes.SELECT },
        );
        expect(rows[0]?.holds).toBe("1");
    });

    it("refuses reservations for a cancelled order", async () => {
        const data = await fixture(3);
        await sequelize.query("UPDATE orders SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(3) WHERE id = (SELECT order_id FROM order_items WHERE id = ?)",
            { replacements: [data.firstItemId] });
        expect(await service.reserveOrderItem({ orderItemId: data.firstItemId,
            idempotencyKey: `cancelled-${data.token}`, expiresAt: expiry() })).toEqual({ kind: "order_item_not_reservable" });
    });
});
