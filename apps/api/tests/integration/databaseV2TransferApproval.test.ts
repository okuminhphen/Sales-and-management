import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { StockRequestV2Service } from "../../src/modules/inventory-transfer/application/stock-request-v2.service.js";
import { StockRequestDecisionV2Service } from "../../src/modules/inventory-transfer/application/stock-request-decision-v2.service.js";
import { TransferApprovalV2Service } from "../../src/modules/inventory-transfer/application/transfer-approval-v2.service.js";
import { TransferDispatchV2Service } from "../../src/modules/inventory-transfer/application/transfer-dispatch-v2.service.js";
import { TransferClosureV2Service } from "../../src/modules/inventory-transfer/application/transfer-closure-v2.service.js";
import { TransferReceiptV2Service } from "../../src/modules/inventory-transfer/application/transfer-receipt-v2.service.js";
import { TransferDiscrepancyV2Service } from "../../src/modules/inventory-transfer/application/transfer-discrepancy-v2.service.js";
import { SequelizeStockRequestV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-v2.repository.js";
import { SequelizeStockRequestDecisionV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-decision-v2.repository.js";
import { SequelizeTransferApprovalV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-approval-v2.repository.js";
import { SequelizeTransferDispatchV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-dispatch-v2.repository.js";
import { SequelizeTransferClosureV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-closure-v2.repository.js";
import { SequelizeTransferReceiptV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-receipt-v2.repository.js";
import { SequelizeTransferDiscrepancyV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-discrepancy-v2.repository.js";
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
        const dispatchService = new TransferDispatchV2Service({ repository: new SequelizeTransferDispatchV2Repository(persistence) });
        const closureService = new TransferClosureV2Service({ repository: new SequelizeTransferClosureV2Repository(persistence) });
        const receiptService = new TransferReceiptV2Service({ repository: new SequelizeTransferReceiptV2Repository(persistence) });
        const discrepancyService = new TransferDiscrepancyV2Service({ repository: new SequelizeTransferDiscrepancyV2Repository(persistence) });
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
        return { admin, transferService, dispatchService, closureService, receiptService, discrepancyService,
            requesterId, transferId: approvedRequest.transferReceiptId,
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

    it("dispatches approved stock once, debits only the source and records a movement", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        const [first, second] = await Promise.all([
            data.dispatchService.dispatch(data.admin, data.transferId),
            data.dispatchService.dispatch(data.admin, data.transferId),
        ]);
        expect([first.kind, second.kind].sort()).toEqual(["dispatched", "transfer_already_processed"]);
        const rows = await sequelize.query<{ status: string; sourceStock: number; destCount: string;
            consumedCount: string; movementCount: string }>(
            `SELECT tr.status, src.stock AS sourceStock,
                    (SELECT COUNT(*) FROM inventories dst WHERE dst.branch_id = tr.to_branch_id
                     AND dst.product_variant_id = ?) AS destCount,
                    (SELECT COUNT(*) FROM inventory_reservations ir JOIN transfer_receipt_items ti
                     ON ti.id = ir.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id
                     AND ir.status = 'consumed') AS consumedCount,
                    (SELECT COUNT(*) FROM inventory_movements im JOIN transfer_receipt_items ti
                     ON ti.id = im.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id
                     AND im.reason = 'transfer_dispatch') AS movementCount
             FROM transfer_receipts tr JOIN inventories src ON src.branch_id = tr.from_branch_id
             AND src.product_variant_id = ? WHERE tr.id = ?`,
            { replacements: [data.variantId, data.variantId, data.transferId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "in_transit", sourceStock: 2, destCount: "0",
            consumedCount: "1", movementCount: "1" });
    });

    it("rolls back earlier source debits when a later transfer item cannot dispatch", async () => {
        const data = await fixture(5);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-Z3-${data.token}`]);
        const secondVariantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.productId, sizeId, `TA-V3-${data.token}`]);
        const requestRows = await sequelize.query<{ requestId: string }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        await insert("INSERT INTO stock_request_items (stock_request_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [requestRows[0].requestId, secondVariantId]);
        const secondItemId = await insert("INSERT INTO transfer_receipt_items (transfer_receipt_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.transferId, secondVariantId]);
        await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 5, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.supplierId, secondVariantId]);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        await sequelize.query("UPDATE inventory_reservations SET status = 'released', released_at = UTC_TIMESTAMP(3) WHERE transfer_receipt_item_id = ?", {
            replacements: [secondItemId] });
        expect(await data.dispatchService.dispatch(data.admin, data.transferId)).toEqual({ kind: "transfer_conflict" });
        const rows = await sequelize.query<{ status: string; stock: number; movementCount: string }>(
            `SELECT tr.status, i.stock,
                    (SELECT COUNT(*) FROM inventory_movements im JOIN transfer_receipt_items ti
                     ON ti.id = im.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id) AS movementCount
             FROM transfer_receipts tr JOIN inventories i ON i.branch_id = tr.from_branch_id
             AND i.product_variant_id = ? WHERE tr.id = ?`,
            { replacements: [data.variantId, data.transferId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "approved", stock: 5, movementCount: "0" });
    });

    it("cancels an approved transfer once and releases its hold without changing stock", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        const sourceManager: V2AccessContext = { ...data.admin, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: data.supplierId }, permissions: ["transfer.manage.branch"] }] };
        const [first, second] = await Promise.all([
            data.closureService.cancel(sourceManager, data.transferId),
            data.closureService.cancel(sourceManager, data.transferId),
        ]);
        expect([first.kind, second.kind].sort()).toEqual(["cancelled", "transfer_already_processed"]);
        const rows = await sequelize.query<{ status: string; holdStatus: string; stock: number;
            movementCount: string; historyCount: string }>(
            `SELECT tr.status, ir.status AS holdStatus, i.stock,
                    (SELECT COUNT(*) FROM inventory_movements im JOIN transfer_receipt_items ti
                     ON ti.id = im.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id) AS movementCount,
                    (SELECT COUNT(*) FROM transfer_history h WHERE h.transfer_receipt_id = tr.id
                     AND h.action = 'CANCELLED') AS historyCount
             FROM transfer_receipts tr JOIN transfer_receipt_items ti ON ti.transfer_receipt_id = tr.id
             JOIN inventory_reservations ir ON ir.transfer_receipt_item_id = ti.id
             JOIN inventories i ON i.branch_id = tr.from_branch_id AND i.product_variant_id = ti.product_variant_id
             WHERE tr.id = ?`,
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "cancelled", holdStatus: "released", stock: 5,
            movementCount: "0", historyCount: "1" });
    });

    it("rejects pending transfer with a reason and refuses rejection after dispatch", async () => {
        const pending = await fixture(5);
        expect(await pending.closureService.reject(pending.admin, pending.transferId, "Insufficient priority"))
            .toEqual({ kind: "rejected" });
        const rejected = await sequelize.query<{ status: string; note: string }>(
            `SELECT tr.status, h.note FROM transfer_receipts tr JOIN transfer_history h
             ON h.transfer_receipt_id = tr.id WHERE tr.id = ? AND h.action = 'REJECTED'`,
            { replacements: [pending.transferId], type: QueryTypes.SELECT });
        expect(rejected[0]).toEqual({ status: "rejected", note: "Insufficient priority" });

        const dispatched = await fixture(5);
        expect((await dispatched.transferService.approve(dispatched.admin, dispatched.transferId)).kind).toBe("approved");
        expect((await dispatched.dispatchService.dispatch(dispatched.admin, dispatched.transferId)).kind).toBe("dispatched");
        expect(await dispatched.closureService.reject(dispatched.admin, dispatched.transferId, "Too late"))
            .toEqual({ kind: "transfer_already_processed" });
        expect(await dispatched.closureService.cancel(dispatched.admin, dispatched.transferId))
            .toEqual({ kind: "transfer_already_processed" });
    });

    it("credits the destination only after explicit full-quantity receipt", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const rows = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        const destinationManager: V2AccessContext = { ...data.admin, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: data.requesterId }, permissions: ["transfer.manage.branch"] }] };
        const input = [{ itemId: rows[0].id, receivedQuantity: 3, lostQuantity: 0, nonSellableQuantity: 0 }];
        expect(await data.receiptService.complete(destinationManager, data.transferId, input))
            .toEqual({ kind: "completed", transferReceiptId: data.transferId });
        expect(await data.receiptService.complete(destinationManager, data.transferId, input))
            .toEqual({ kind: "transfer_already_processed" });
        const state = await sequelize.query<{ status: string; sourceStock: number; destinationStock: number;
            movementCount: string; historyCount: string }>(
            `SELECT tr.status, src.stock AS sourceStock, dst.stock AS destinationStock,
                    (SELECT COUNT(*) FROM inventory_movements im WHERE im.transfer_receipt_item_id = ?
                     AND im.reason = 'transfer_receive') AS movementCount,
                    (SELECT COUNT(*) FROM transfer_history h WHERE h.transfer_receipt_id = tr.id
                     AND h.action = 'COMPLETED') AS historyCount
             FROM transfer_receipts tr JOIN inventories src ON src.branch_id = tr.from_branch_id
             AND src.product_variant_id = ? JOIN inventories dst ON dst.branch_id = tr.to_branch_id
             AND dst.product_variant_id = ? WHERE tr.id = ?`,
            { replacements: [rows[0].id, data.variantId, data.variantId, data.transferId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ status: "completed", sourceStock: 2, destinationStock: 3,
            movementCount: "1", historyCount: "1" });
    });

    it("fails closed on loss/damage without crediting the destination or completing", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const rows = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(await data.receiptService.complete(data.admin, data.transferId,
            [{ itemId: rows[0].id, receivedQuantity: 2, lostQuantity: 1, nonSellableQuantity: 0 }]))
            .toEqual({ kind: "discrepancy_requires_approval" });
        const state = await sequelize.query<{ status: string; destinationCount: string }>(
            `SELECT tr.status, (SELECT COUNT(*) FROM inventories i WHERE i.branch_id = tr.to_branch_id
                AND i.product_variant_id = ?) AS destinationCount
             FROM transfer_receipts tr WHERE tr.id = ?`,
            { replacements: [data.variantId, data.transferId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ status: "in_transit", destinationCount: "0" });
    });

    it("rolls back all destination credits if a later item would overflow stock", async () => {
        const data = await fixture(5);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TA-Z4-${data.token}`]);
        const secondVariantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.productId, sizeId, `TA-V4-${data.token}`]);
        const requestRows = await sequelize.query<{ requestId: string }>(
            "SELECT stock_request_id AS requestId FROM transfer_receipts WHERE id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        await insert("INSERT INTO stock_request_items (stock_request_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [requestRows[0].requestId, secondVariantId]);
        const secondItemId = await insert("INSERT INTO transfer_receipt_items (transfer_receipt_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.transferId, secondVariantId]);
        await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 5, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.supplierId, secondVariantId]);
        await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 2147483647, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.requesterId, secondVariantId]);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const firstRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ? AND product_variant_id = ?",
            { replacements: [data.transferId, data.variantId], type: QueryTypes.SELECT });
        expect(await data.receiptService.complete(data.admin, data.transferId, [
            { itemId: firstRows[0].id, receivedQuantity: 3, lostQuantity: 0, nonSellableQuantity: 0 },
            { itemId: secondItemId, receivedQuantity: 3, lostQuantity: 0, nonSellableQuantity: 0 },
        ])).toEqual({ kind: "transfer_unavailable" });
        const state = await sequelize.query<{ status: string; destinationCount: string; movementCount: string }>(
            `SELECT tr.status, (SELECT COUNT(*) FROM inventories i WHERE i.branch_id = tr.to_branch_id
                AND i.product_variant_id = ?) AS destinationCount,
                (SELECT COUNT(*) FROM inventory_movements im JOIN transfer_receipt_items ti
                 ON ti.id = im.transfer_receipt_item_id WHERE ti.transfer_receipt_id = tr.id
                 AND im.reason = 'transfer_receive') AS movementCount
             FROM transfer_receipts tr WHERE tr.id = ?`,
            { replacements: [data.variantId, data.transferId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ status: "in_transit", destinationCount: "0", movementCount: "0" });
    });

    it("records loss with actor/note but does not credit sellable stock before separate approval", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const items = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        const input = [{ itemId: items[0].id, receivedQuantity: 2,
            lostQuantity: 1, nonSellableQuantity: 0 }];
        const destinationManager: V2AccessContext = { ...data.admin, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: data.requesterId }, permissions: ["transfer.manage.branch"] }] };
        expect(await data.discrepancyService.record(destinationManager, data.transferId, input, "One item missing"))
            .toEqual({ kind: "recorded" });
        expect(await data.discrepancyService.record(destinationManager, data.transferId, input, "Changed story"))
            .toEqual({ kind: "already_recorded" });
        const state = await sequelize.query<{ status: string; received: number; lost: number; note: string;
            recordedBy: string; destinationCount: string }>(
            `SELECT tr.status, ti.received_quantity AS received, ti.lost_quantity AS lost,
                    h.note, h.performed_by_account_id AS recordedBy,
                    (SELECT COUNT(*) FROM inventories i WHERE i.branch_id = tr.to_branch_id
                     AND i.product_variant_id = ti.product_variant_id) AS destinationCount
             FROM transfer_receipts tr JOIN transfer_receipt_items ti ON ti.transfer_receipt_id = tr.id
             JOIN transfer_history h ON h.transfer_receipt_id = tr.id AND h.action = 'RECEIPT_RECORDED'
             WHERE tr.id = ?`,
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ status: "in_transit", received: 2, lost: 1,
            note: "One item missing", recordedBy: data.admin.accountId, destinationCount: "0" });
    });

    it("requires a different global approver and credits only sellable received quantity", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const items = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(await data.discrepancyService.record(data.admin, data.transferId,
            [{ itemId: items[0].id, receivedQuantity: 2, lostQuantity: 1, nonSellableQuantity: 0 }],
            "One unit missing")).toEqual({ kind: "recorded" });
        expect(await data.discrepancyService.approve(data.admin, data.transferId, "Approved loss"))
            .toEqual({ kind: "separation_of_duties" });
        const approverId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`approver-${data.token}@example.invalid`]);
        const approver: V2AccessContext = { ...data.admin, accountId: approverId };
        expect(await data.discrepancyService.approve(approver, data.transferId, "Approved loss"))
            .toEqual({ kind: "completed", transferReceiptId: data.transferId });
        expect(await data.discrepancyService.approve(approver, data.transferId, "Again"))
            .toEqual({ kind: "transfer_already_processed" });
        const state = await sequelize.query<{ status: string; sourceStock: number; destinationStock: number;
            movementCount: string; approvedBy: string; note: string }>(
            `SELECT tr.status, src.stock AS sourceStock, dst.stock AS destinationStock,
                    (SELECT COUNT(*) FROM inventory_movements im WHERE im.transfer_receipt_item_id = ?
                     AND im.reason = 'transfer_receive') AS movementCount,
                    h.performed_by_account_id AS approvedBy, h.note
             FROM transfer_receipts tr JOIN inventories src ON src.branch_id = tr.from_branch_id
             AND src.product_variant_id = ? JOIN inventories dst ON dst.branch_id = tr.to_branch_id
             AND dst.product_variant_id = ? JOIN transfer_history h ON h.transfer_receipt_id = tr.id
             AND h.action = 'DISCREPANCY_APPROVED' WHERE tr.id = ?`,
            { replacements: [items[0].id, data.variantId, data.variantId, data.transferId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ status: "completed", sourceStock: 2, destinationStock: 2,
            movementCount: "1", approvedBy: approverId, note: "Approved loss" });
    });

    it("completes an all-lost receipt only after independent approval without a zero-delta movement", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const items = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(await data.discrepancyService.record(data.admin, data.transferId,
            [{ itemId: items[0].id, receivedQuantity: 0, lostQuantity: 3, nonSellableQuantity: 0 }],
            "Entire parcel lost")).toEqual({ kind: "recorded" });
        const approverId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`approver-zero-${data.token}@example.invalid`]);
        expect(await data.discrepancyService.approve({ ...data.admin, accountId: approverId },
            data.transferId, "Loss confirmed")).toEqual({ kind: "completed", transferReceiptId: data.transferId });
        const rows = await sequelize.query<{ status: string; destinationCount: string; receiveMovementCount: string }>(
            `SELECT tr.status, (SELECT COUNT(*) FROM inventories i WHERE i.branch_id = tr.to_branch_id
                AND i.product_variant_id = ?) AS destinationCount,
                (SELECT COUNT(*) FROM inventory_movements im WHERE im.transfer_receipt_item_id = ?
                 AND im.reason = 'transfer_receive') AS receiveMovementCount
             FROM transfer_receipts tr WHERE tr.id = ?`,
            { replacements: [data.variantId, items[0].id, data.transferId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "completed", destinationCount: "0", receiveMovementCount: "0" });
    });

    it("allows only one of two concurrent independent discrepancy approvals", async () => {
        const data = await fixture(5);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const items = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(await data.discrepancyService.record(data.admin, data.transferId,
            [{ itemId: items[0].id, receivedQuantity: 2, lostQuantity: 0, nonSellableQuantity: 1 }],
            "Damaged unit")).toEqual({ kind: "recorded" });
        const firstId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`first-${data.token}@example.invalid`]);
        const secondId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`second-${data.token}@example.invalid`]);
        const outcomes = await Promise.all([
            data.discrepancyService.approve({ ...data.admin, accountId: firstId }, data.transferId, "Approved"),
            data.discrepancyService.approve({ ...data.admin, accountId: secondId }, data.transferId, "Approved"),
        ]);
        expect(outcomes.map((result) => result.kind).sort()).toEqual(["completed", "transfer_already_processed"]);
        const state = await sequelize.query<{ stock: number; movementCount: string; approvalCount: string }>(
            `SELECT i.stock,
                    (SELECT COUNT(*) FROM inventory_movements im WHERE im.transfer_receipt_item_id = ?
                     AND im.reason = 'transfer_receive') AS movementCount,
                    (SELECT COUNT(*) FROM transfer_history h WHERE h.transfer_receipt_id = ?
                     AND h.action = 'DISCREPANCY_APPROVED') AS approvalCount
             FROM inventories i WHERE i.branch_id = ? AND i.product_variant_id = ?`,
            { replacements: [items[0].id, data.transferId, data.requesterId, data.variantId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ stock: 2, movementCount: "1", approvalCount: "1" });
    });

    it("keeps the recorded discrepancy pending if destination credit cannot commit", async () => {
        const data = await fixture(5);
        await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 2147483647, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.requesterId, data.variantId]);
        expect((await data.transferService.approve(data.admin, data.transferId)).kind).toBe("approved");
        expect((await data.dispatchService.dispatch(data.admin, data.transferId)).kind).toBe("dispatched");
        const items = await sequelize.query<{ id: string }>(
            "SELECT id FROM transfer_receipt_items WHERE transfer_receipt_id = ?",
            { replacements: [data.transferId], type: QueryTypes.SELECT });
        expect(await data.discrepancyService.record(data.admin, data.transferId,
            [{ itemId: items[0].id, receivedQuantity: 2, lostQuantity: 1, nonSellableQuantity: 0 }],
            "One missing")).toEqual({ kind: "recorded" });
        const approverId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`overflow-${data.token}@example.invalid`]);
        expect(await data.discrepancyService.approve({ ...data.admin, accountId: approverId },
            data.transferId, "Approved")).toEqual({ kind: "transfer_unavailable" });
        const state = await sequelize.query<{ status: string; recordedCount: string;
            approvedCount: string; receiveMovementCount: string }>(
            `SELECT tr.status,
                    (SELECT COUNT(*) FROM transfer_history h WHERE h.transfer_receipt_id = tr.id
                     AND h.action = 'RECEIPT_RECORDED') AS recordedCount,
                    (SELECT COUNT(*) FROM transfer_history h WHERE h.transfer_receipt_id = tr.id
                     AND h.action = 'DISCREPANCY_APPROVED') AS approvedCount,
                    (SELECT COUNT(*) FROM inventory_movements im WHERE im.transfer_receipt_item_id = ?
                     AND im.reason = 'transfer_receive') AS receiveMovementCount
             FROM transfer_receipts tr WHERE tr.id = ?`,
            { replacements: [items[0].id, data.transferId], type: QueryTypes.SELECT });
        expect(state[0]).toEqual({ status: "in_transit", recordedCount: "1",
            approvedCount: "0", receiveMovementCount: "0" });
    });
});
