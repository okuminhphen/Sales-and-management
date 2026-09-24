import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { StockRequestV2Service } from "../../src/modules/inventory-transfer/application/stock-request-v2.service.js";
import { StockRequestDecisionV2Service } from "../../src/modules/inventory-transfer/application/stock-request-decision-v2.service.js";
import { TransferApprovalV2Service } from "../../src/modules/inventory-transfer/application/transfer-approval-v2.service.js";
import { SequelizeStockRequestV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-v2.repository.js";
import { SequelizeStockRequestDecisionV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-decision-v2.repository.js";
import { SequelizeTransferApprovalV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-approval-v2.repository.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Database V2 transfer approval on MySQL", () => {
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
    const insert = async (sql: string, values: unknown[]): Promise<string> => {
        const [id] = await sequelize.query(sql, { replacements: values, type: QueryTypes.INSERT });
        return String(id);
    };
    const fixture = async (stock: number) => {
        const token = randomUUID().replace(/-/g, "").slice(0, 12);
        const accountId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`transfer-${token}@example.invalid`]);
        const requesterId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Requester', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-R-${token}`]);
        const supplierId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Supplier', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-S-${token}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Transfer', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-C-${token}`, `ta-c-${token}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, status, created_at, updated_at) VALUES (?, 'Transfer', ?, '100.0000', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `ta-p-${token}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-Z-${token}`]);
        const variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `TA-V-${token}`]);
        await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [supplierId, variantId, stock]);
        const persistence = createSalesV2Persistence(sequelize);
        const requestService = new StockRequestV2Service({ repository: new SequelizeStockRequestV2Repository(persistence) });
        const decisionService = new StockRequestDecisionV2Service({ repository: new SequelizeStockRequestDecisionV2Repository(persistence) });
        const transferService = new TransferApprovalV2Service({ repository: new SequelizeTransferApprovalV2Repository(persistence) });
        const manager: V2AccessContext = { accountId, customerId: null, employeeId: null, grants: [{
            roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: requesterId },
            permissions: ["stock_request.manage.branch"],
        }] };
        const admin: V2AccessContext = { ...manager, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["stock_request.manage.branch", "transfer.manage.branch"] }] };
        const created = await requestService.create(manager, { fromBranchId: requesterId, toBranchId: supplierId,
            items: [{ productSizeId: variantId, quantity: 3 }] });
        if (created.kind !== "created") throw Error("Request setup failed.");
        const approvedRequest = await decisionService.approve(admin, created.id);
        if (approvedRequest.kind !== "approved") throw Error("Transfer setup failed.");
        return { admin, transferService, transferId: approvedRequest.transferReceiptId,
            supplierId, variantId, productId, token };
    };

    it("reserves stock on approval without debiting source or crediting destination, and rejects replay", async () => {
        const data = await fixture(5);
        const [first, second] = await Promise.all([
            data.transferService.approve(data.admin, data.transferId),
            data.transferService.approve(data.admin, data.transferId),
        ]);
        expect([first.kind, second.kind].sort()).toEqual(["approved", "transfer_already_processed"]);
        const rows = await sequelize.query<{ status: string; holdCount: string; stock: number; movementCount: string }>(
            `SELECT tr.status, (SELECT COUNT(*) FROM inventory_reservations ir JOIN transfer_receipt_items ti
                    ON ti.id = ir.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id AND ir.status = 'active') AS holdCount,
                    i.stock, (SELECT COUNT(*) FROM inventory_movements im JOIN transfer_receipt_items ti
                    ON ti.id = im.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id) AS movementCount
             FROM transfer_receipts tr JOIN inventories i ON i.branch_id = tr.from_branch_id
             WHERE tr.id = ? AND i.product_variant_id = ?`,
            { replacements: [data.transferId, data.variantId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "approved", holdCount: "1", stock: 5, movementCount: "0" });
    });

    it("rolls back approval and every hold when source stock is insufficient", async () => {
        const data = await fixture(2);
        expect(await data.transferService.approve(data.admin, data.transferId)).toEqual({ kind: "insufficient_stock" });
        const rows = await sequelize.query<{ status: string; holdCount: string; historyCount: string }>(
            `SELECT tr.status,
                    (SELECT COUNT(*) FROM inventory_reservations ir JOIN transfer_receipt_items ti
                     ON ti.id = ir.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id) AS holdCount,
                    (SELECT COUNT(*) FROM transfer_history h WHERE h.transfer_receipt_id = tr.id AND h.action = 'APPROVED') AS historyCount
             FROM transfer_receipts tr WHERE tr.id = ?`,
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "pending", holdCount: "0", historyCount: "0" });
    });

    it("rolls back an earlier successful item hold if a later item cannot be reserved", async () => {
        const data = await fixture(5);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-Z2-${data.token}`]);
        const secondVariantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.productId, sizeId, `TA-V2-${data.token}`]);
        const requestRows = await sequelize.query<{ requestId: string }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        await insert("INSERT INTO stock_request_items (stock_request_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [requestRows[0].requestId, secondVariantId]);
        await insert("INSERT INTO transfer_receipt_items (transfer_receipt_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.transferId, secondVariantId]);
        await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.supplierId, secondVariantId]);
        expect(await data.transferService.approve(data.admin, data.transferId)).toEqual({ kind: "insufficient_stock" });
        const rows = await sequelize.query<{ status: string; holdCount: string }>(
            `SELECT tr.status, (SELECT COUNT(*) FROM inventory_reservations ir JOIN transfer_receipt_items ti
                ON ti.id = ir.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id) AS holdCount
             FROM transfer_receipts tr WHERE tr.id = ?`,
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "pending", holdCount: "0" });
    });
});
