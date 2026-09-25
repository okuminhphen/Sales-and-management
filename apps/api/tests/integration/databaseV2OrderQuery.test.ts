import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { OrderQueryV2Service } from "../../src/modules/commerce/application/order-query-v2.service.js";
import { SequelizeOrderQueryV2Repository } from "../../src/modules/commerce/persistence/order-query-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 order read scope on MySQL", () => {
    let sequelize: Sequelize;
    let service: OrderQueryV2Service;
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const one = async <Row extends object>(sql: string, replacements: unknown[]): Promise<Row> => {
        const rows = await sequelize.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing order read fixture.");
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
        service = new OrderQueryV2Service({ repository:
            new SequelizeOrderQueryV2Repository(createSalesV2Persistence(sequelize)) });
    });
    afterAll(async () => { await sequelize?.close(); });

    it("filters by customer or branch in SQL before pagination and hides foreign detail", async () => {
        const branchIds: string[] = [];
        const customerIds: string[] = [];
        for (const label of ["A", "B"]) {
            const code = `OQ-${label}-${suffix}`;
            await sequelize.query(
                "INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, ?, 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                { replacements: [code, `Order query ${label}`] },
            );
            branchIds.push((await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [code])).id);
            const name = `Order query customer ${label} ${suffix}`;
            await sequelize.query(
                "INSERT INTO customers (account_id, full_name, status, loyalty_points, created_at, updated_at) VALUES (NULL, ?, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                { replacements: [name] },
            );
            customerIds.push((await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [name])).id);
        }
        const createdIds: string[] = [];
        for (const index of [0, 1, 2]) {
            const key = `order-query-${index}-${suffix}`;
            const customerId = customerIds[index === 2 ? 0 : index];
            const branchId = branchIds[index === 1 ? 1 : 0];
            await sequelize.query(
                `INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id,
                    channel, fulfillment_type, fulfillment_status, status, currency,
                    subtotal_amount, discount_amount, shipping_fee, total_amount,
                    customer_name, placed_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'online', 'store_pickup', 'unfulfilled', 'pending', 'VND',
                    '25.0000', '0.0000', '0.0000', '25.0000', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                { replacements: [key, key, customerId, branchId, `Buyer ${index}`] },
            );
            const orderId = (await one<{ id: string }>("SELECT id FROM orders WHERE checkout_key = ?", [key])).id;
            createdIds.push(orderId);
            await sequelize.query(
                `INSERT INTO order_items (order_id, product_id, product_variant_id,
                    sku_snapshot, product_name_snapshot, size_name_snapshot, unit_price,
                    discount_amount, quantity, line_total, created_at)
                 VALUES (?, NULL, NULL, ?, 'Snapshot product', 'M', '25.0000', '0.0000', 1,
                    '25.0000', UTC_TIMESTAMP(3))`,
                { replacements: [orderId, `SKU-${index}-${suffix}`] },
            );
        }
        const owner: V2AccessContext = {
            accountId: "1", customerId: customerIds[0]!, employeeId: null,
            grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: ["order.read.own"] }],
        };
        const branchStaff: V2AccessContext = {
            accountId: "2", customerId: null, employeeId: "1",
            grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: branchIds[1]! },
                permissions: ["order.read.branch"] }],
        };
        const ownPage = await service.listOwn(owner, 1, 1);
        expect(ownPage.kind).toBe("orders");
        if (ownPage.kind !== "orders") throw new Error("Expected own orders.");
        expect(ownPage.page.totalItems).toBe(2);
        expect(ownPage.page.orders).toHaveLength(1);
        expect(ownPage.page.orders[0]?.items[0]?.skuSnapshot).toBe(`SKU-2-${suffix}`);
        expect(ownPage.page.orders[0]?.totalAmount).toBe("25.0000");
        const branchPage = await service.listBranch(branchStaff, branchIds[1], 1, 10);
        expect(branchPage.kind).toBe("orders");
        if (branchPage.kind !== "orders") throw new Error("Expected branch orders.");
        expect(branchPage.page.orders.map((order) => order.id)).toEqual([createdIds[1]]);
        expect(await service.detail(branchStaff, createdIds[0])).toEqual({ kind: "order_not_found" });
        expect((await service.detail(owner, createdIds[2])).kind).toBe("order");
        expect(await service.detail(owner, createdIds[1])).toEqual({ kind: "order_not_found" });
    });
});
