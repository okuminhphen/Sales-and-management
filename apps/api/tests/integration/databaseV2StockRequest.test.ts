import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { StockRequestV2Service } from "../../src/modules/inventory-transfer/application/stock-request-v2.service.js";
import { SequelizeStockRequestV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Database V2 stock request on MySQL", () => {
    let sequelize: Sequelize;
    let service: StockRequestV2Service;
    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw Error("An explicit _test database is required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        service = new StockRequestV2Service({ repository: new SequelizeStockRequestV2Repository(createSalesV2Persistence(sequelize)) });
    });
    afterAll(async () => { await sequelize?.close(); });

    const insert = async (sql: string, replacements: unknown[]): Promise<string> => {
        const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
        return String(id);
    };
    const fixture = async () => {
        const token = randomUUID().replace(/-/g, "").slice(0, 12);
        const accountId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`request-${token}@example.invalid`]);
        const requesterId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Requester', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`SR-R-${token}`]);
        const supplierId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Supplier', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`SR-S-${token}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Request', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`SR-C-${token}`, `sr-c-${token}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'Request', ?, '100.0000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `sr-p-${token}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`SR-Z-${token}`]);
        const variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `SR-V-${token}`]);
        const context: V2AccessContext = { accountId, customerId: null, employeeId: null, grants: [{
            roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: requesterId },
            permissions: ["stock_request.manage.branch"],
        }] };
        return { token, accountId, requesterId, supplierId, variantId, context };
    };

    it("creates request, item and audit atomically without creating a transfer or moving stock", async () => {
        const data = await fixture();
        const result = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: data.variantId, quantity: 3, note: "Need stock" }] });
        expect(result.kind).toBe("created");
        if (result.kind !== "created") return;
        const rows = await sequelize.query<{ code: string; status: string; fromBranchId: string;
            toBranchId: string; actorId: string; variantId: string; quantity: number; history: string; transferCount: string }>(
            `SELECT sr.code, sr.status, sr.from_branch_id AS fromBranchId, sr.to_branch_id AS toBranchId,
                    sr.created_by_account_id AS actorId, si.product_variant_id AS variantId, si.quantity,
                    (SELECT COUNT(*) FROM stock_request_history h WHERE h.stock_request_id = sr.id AND h.action = 'REQUESTED') AS history,
                    (SELECT COUNT(*) FROM transfer_receipts tr WHERE tr.stock_request_id = sr.id) AS transferCount
             FROM stock_requests sr JOIN stock_request_items si ON si.stock_request_id = sr.id WHERE sr.id = ?`,
            { replacements: [result.id], type: QueryTypes.SELECT });
        expect(rows[0]).toMatchObject({ code: result.code, status: "pending", fromBranchId: data.requesterId,
            toBranchId: data.supplierId, actorId: data.accountId, variantId: data.variantId,
            quantity: 3, history: "1", transferCount: "0" });
    });

    it("rejects unknown variants without leaving a request or history row", async () => {
        const data = await fixture();
        const result = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: "9223372036854775807", quantity: 1 }] });
        expect(result).toEqual({ kind: "variant_not_found" });
        const rows = await sequelize.query<{ count: string }>(
            "SELECT COUNT(*) AS count FROM stock_requests WHERE created_by_account_id = ? AND from_branch_id = ?",
            { replacements: [data.accountId, data.requesterId], type: QueryTypes.SELECT });
        expect(rows[0]?.count).toBe("0");
    });

    it("returns branch-scoped and pending pages with legacy item/branch shapes", async () => {
        const data = await fixture();
        const created = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: data.variantId, quantity: 2 }] });
        expect(created.kind).toBe("created");
        const branchPage = await service.listByBranch({ ...data.context, grants: [{
            roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: data.requesterId },
            permissions: ["stock_request.read.branch"],
        }] }, data.requesterId, 1, 20);
        expect(branchPage.kind).toBe("requests");
        if (branchPage.kind !== "requests" || created.kind !== "created") return;
        expect(branchPage.page.requests.find((row) => row.id === created.id)).toMatchObject({
            id: created.id, code: created.code, fromBranchId: data.requesterId,
            toBranchId: data.supplierId, fromBranch: { name: "Requester" },
            toBranch: { name: "Supplier" },
            items: [{ productSizeId: data.variantId, quantity: 2,
                productSize: { product: { name: "Request" } } }],
            histories: [{ action: "REQUESTED", performedBy: data.accountId }],
        });
        const admin: V2AccessContext = { ...data.context, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["stock_request.read.branch"] }] };
        const pending = await service.listPending(admin, 1, 100);
        expect(pending.kind).toBe("requests");
        if (pending.kind === "requests") expect(pending.page.requests.some((row) => row.id === created.id)).toBe(true);
    });
});
