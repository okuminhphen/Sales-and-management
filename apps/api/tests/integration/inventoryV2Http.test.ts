import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { SequelizeCustomerAuthV2Repository } from "../../src/modules/identity-access/persistence/customer-auth-v2.repository.js";
import { createInventoryV2Router } from "../../src/routes/inventory-v2.js";
import { signV2AccessToken } from "../../src/security/v2-access-token.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Inventory V2 HTTP with real MySQL identity", () => {
    let sequelize: Sequelize;
    let app: express.Express;
    let adminToken: string;
    let customerToken: string;
    let branchId: string;
    let variantId: string;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);

    const insert = async (sql: string, replacements: unknown[]): Promise<string> => {
        const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
        return String(id);
    };
    const one = async (sql: string, replacements: unknown[]): Promise<string> => {
        const rows = await sequelize.query<{ id: unknown }>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw Error("Fixture not found.");
        return String(rows[0].id);
    };
    const token = (accountId: string) => signV2AccessToken({ version: 2, accountId,
        customerId: null, employeeId: null, roleGrants: [{ roleCode: "CUSTOMER", scope: { type: "global" } }] });

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw Error("An explicit _test database is required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        const adminEmail = `inventory-admin-${suffix}@example.invalid`;
        await seedV2Database(sequelize, { email: adminEmail, password: "test-only-inventory-admin-password" });
        const adminId = await one("SELECT id FROM accounts WHERE email = ?", [adminEmail]);
        adminToken = token(adminId);
        const persistence = createSalesV2Persistence(sequelize);
        const identities = new SequelizeCustomerAuthV2Repository(persistence);
        const customer = await identities.registerVerifiedCustomer({
            email: `inventory-customer-${suffix}@example.invalid`, username: `inventory_${suffix}`,
            phone: "0900000000", passwordHash: "test-only-not-used-for-login",
        });
        if (customer.kind !== "created") throw Error("Could not create customer fixture.");
        customerToken = token(customer.accountId);
        branchId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Inventory', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`INV-${suffix}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Inventory', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`INVCAT-${suffix}`, `invcat-${suffix}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'Inventory product', ?, '25000.0000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `invproduct-${suffix}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`INVSIZE-${suffix}`]);
        variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, status, created_at, updated_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `INVSKU-${suffix}`]);
        const inventoryId = await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [branchId, variantId]);
        const orderId = await insert("INSERT INTO orders (code, checkout_key, fulfillment_branch_id, created_by_account_id, channel, fulfillment_type, subtotal_amount, total_amount, placed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_store', 'carry_out', '50000.0000', '50000.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`INVORD-${suffix}`, `invcheckout-${suffix}`, branchId, adminId]);
        const itemId = await insert("INSERT INTO order_items (order_id, product_variant_id, sku_snapshot, product_name_snapshot, size_name_snapshot, unit_price, quantity, line_total, created_at) VALUES (?, ?, 'SKU', 'Product', 'M', '25000.0000', 2, '50000.0000', UTC_TIMESTAMP(3))", [orderId, variantId]);
        await insert("INSERT INTO inventory_reservations (inventory_id, order_item_id, quantity, status, expires_at, idempotency_key, created_at, updated_at) VALUES (?, ?, 2, 'active', '2020-01-01 00:00:00', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [inventoryId, itemId, `invhold-${suffix}`]);
        app = express();
        app.use("/api/v1", createInventoryV2Router(persistence));
    });
    afterAll(async () => { await sequelize?.close(); });

    it("rejects unauthenticated and customer-scoped inventory reads despite forged JWT role hints", async () => {
        await request(app).get(`/api/v1/inventory/${branchId}`).expect(401);
        await request(app).get(`/api/v1/inventory/${branchId}`).set("Authorization", `Bearer ${customerToken}`).expect(403);
    });

    it("returns the existing grouped envelope with V2 ID, money and availability contracts", async () => {
        const result = await request(app).get(`/api/v1/inventory/${branchId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
        expect(result.body).toMatchObject({ EC: 0, DT: [{ price: "25000.0000", sizes: [{
            productSizeId: variantId, stock: 3, reserved: 2, available: 1,
        }] }] });
        expect(typeof result.body.DT[0].id).toBe("string");
        await request(app).get("/api/v1/inventory/0").set("Authorization", `Bearer ${adminToken}`).expect(400);
        await request(app).get("/api/v1/inventory/999999999999999999").set("Authorization", `Bearer ${adminToken}`).expect(404);
    });
});
