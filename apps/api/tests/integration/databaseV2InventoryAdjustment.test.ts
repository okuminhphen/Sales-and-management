import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { InventoryAdjustmentV2Service } from "../../src/modules/inventory-transfer/application/inventory-adjustment-v2.service.js";
import { InventoryReservationV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-v2.service.js";
import { SequelizeInventoryAdjustmentV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-adjustment-v2.repository.js";
import { SequelizeInventoryReservationV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-reservation-v2.repository.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Database V2 inventory adjustment ledger on MySQL", () => {
    let sequelize: Sequelize;
    let adjuster: InventoryAdjustmentV2Service;
    let reserver: InventoryReservationV2Service;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw Error("An explicit _test database is required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        const persistence = createSalesV2Persistence(sequelize);
        adjuster = new InventoryAdjustmentV2Service({ repository: new SequelizeInventoryAdjustmentV2Repository(persistence) });
        reserver = new InventoryReservationV2Service({ repository: new SequelizeInventoryReservationV2Repository(persistence) });
    });
    afterAll(async () => { await sequelize?.close(); });

    const insert = async (sql: string, replacements: unknown[]): Promise<string> => {
        const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
        return String(id);
    };
    const fixture = async () => {
        const token = randomUUID().replace(/-/g, "").slice(0, 12);
        const accountId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`adjust-${token}@example.invalid`]);
        const branchId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Adjust', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`ADJ-${token}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Adjust', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`ADJCAT-${token}`, `adjcat-${token}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, created_at, updated_at) VALUES (?, 'Adjust', ?, '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `adjproduct-${token}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`ADJSIZE-${token}`]);
        const variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `ADJSKU-${token}`]);
        const context: V2AccessContext = { accountId, customerId: null, employeeId: null, grants: [
            { roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["inventory.manage.branch"] },
        ] };
        const input = (key: string, delta: number) => ({ branchId, variantId, quantityDelta: delta,
            reason: "Physical count correction", idempotencyKey: `adjust-${key}-${token}` });
        return { token, accountId, branchId, variantId, context, input };
    };

    it("opens balance with a movement, replays exactly and rejects key reuse with changed payload", async () => {
        const data = await fixture();
        const first = await adjuster.adjust(data.context, data.input("open", 5));
        expect(first).toMatchObject({ kind: "adjusted", balanceAfter: 5 });
        expect(await adjuster.adjust(data.context, data.input("open", 5))).toEqual({ ...first, kind: "replayed" });
        expect(await adjuster.adjust(data.context, data.input("open", 4))).toEqual({ kind: "idempotency_conflict" });
        const rows = await sequelize.query<{ stock: number; movementCount: string }>(
            "SELECT i.stock, (SELECT COUNT(*) FROM inventory_movements m WHERE m.branch_id = i.branch_id AND m.product_variant_id = i.product_variant_id) AS movementCount FROM inventories i WHERE i.branch_id = ? AND i.product_variant_id = ?",
            { replacements: [data.branchId, data.variantId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ stock: 5, movementCount: "1" });
    });

    it("will not reduce physical stock below active holds", async () => {
        const data = await fixture();
        expect((await adjuster.adjust(data.context, data.input("open", 3))).kind).toBe("adjusted");
        const orderId = await insert("INSERT INTO orders (code, checkout_key, fulfillment_branch_id, created_by_account_id, channel, fulfillment_type, subtotal_amount, total_amount, placed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_store', 'carry_out', '200.0000', '200.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`ADJORD-${data.token}`, `adjcheckout-${data.token}`, data.branchId, data.accountId]);
        const itemId = await insert("INSERT INTO order_items (order_id, product_variant_id, sku_snapshot, product_name_snapshot, size_name_snapshot, unit_price, quantity, line_total, created_at) VALUES (?, ?, 'SKU', 'Product', 'M', '100.0000', 2, '200.0000', UTC_TIMESTAMP(3))", [orderId, data.variantId]);
        const expiresAt = new Date(Math.ceil((Date.now() + 3_600_000) / 1000) * 1000);
        expect((await reserver.reserveOrderItem({ orderItemId: itemId, idempotencyKey: `hold-${data.token}`, expiresAt })).kind).toBe("reserved");
        expect(await adjuster.adjust(data.context, data.input("blocked", -2))).toEqual({ kind: "insufficient_stock" });
        expect(await adjuster.adjust(data.context, data.input("allowed", -1))).toMatchObject({ kind: "adjusted", balanceAfter: 2 });
        const rows = await sequelize.query<{ stock: number; movementCount: string }>(
            "SELECT i.stock, (SELECT COUNT(*) FROM inventory_movements m WHERE m.branch_id = i.branch_id AND m.product_variant_id = i.product_variant_id) AS movementCount FROM inventories i WHERE i.branch_id = ? AND i.product_variant_id = ?",
            { replacements: [data.branchId, data.variantId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ stock: 2, movementCount: "2" });
    });

    it("serializes two decrements and records only the successful movement", async () => {
        const data = await fixture();
        expect((await adjuster.adjust(data.context, data.input("open", 5))).kind).toBe("adjusted");
        const results = await Promise.all([
            adjuster.adjust(data.context, data.input("a", -3)),
            adjuster.adjust(data.context, data.input("b", -3)),
        ]);
        expect(results.map((result) => result.kind).sort()).toEqual(["adjusted", "insufficient_stock"]);
        const rows = await sequelize.query<{ stock: number; movementCount: string }>(
            "SELECT i.stock, (SELECT COUNT(*) FROM inventory_movements m WHERE m.branch_id = i.branch_id AND m.product_variant_id = i.product_variant_id) AS movementCount FROM inventories i WHERE i.branch_id = ? AND i.product_variant_id = ?",
            { replacements: [data.branchId, data.variantId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ stock: 2, movementCount: "2" });
    });
});
