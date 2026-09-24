import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { StockRequestV2Service } from "../../src/modules/inventory-transfer/application/stock-request-v2.service.js";
import { StockRequestDecisionV2Service } from "../../src/modules/inventory-transfer/application/stock-request-decision-v2.service.js";
import { SequelizeStockRequestDecisionV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-decision-v2.repository.js";
import { SequelizeStockRequestV2Repository } from "../../src/modules/inventory-transfer/persistence/stock-request-v2.repository.js";
import { createStockRequestV2Router } from "../../src/modules/inventory-transfer/interfaces/http/stock-request-v2.routes.js";
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

    it("updates only a creator-owned pending request and cancels it without deleting audit history", async () => {
        const data = await fixture();
        const created = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: data.variantId, quantity: 2 }] });
        if (created.kind !== "created") throw Error("Stock request fixture failed.");
        expect(await service.update(data.context, created.id, { items: [{ productSizeId: data.variantId,
            quantity: 4, note: "Updated" }] })).toEqual({ kind: "updated" });
        expect(await service.cancel(data.context, created.id)).toEqual({ kind: "cancelled" });
        expect(await service.update(data.context, created.id, { items: [{ productSizeId: data.variantId, quantity: 5 }] }))
            .toEqual({ kind: "request_already_processed" });
        const rows = await sequelize.query<{ status: string; quantity: number; note: string; historyCount: string }>(
            `SELECT sr.status, si.quantity, si.note,
                    (SELECT COUNT(*) FROM stock_request_history h WHERE h.stock_request_id = sr.id) AS historyCount
             FROM stock_requests sr JOIN stock_request_items si ON si.stock_request_id = sr.id WHERE sr.id = ?`,
            { replacements: [created.id], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "cancelled", quantity: 4, note: "Updated", historyCount: "3" });
    });

    it("does not partially change the supplier branch when replacement items are invalid", async () => {
        const data = await fixture();
        const created = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: data.variantId, quantity: 2 }] });
        if (created.kind !== "created") throw Error("Stock request fixture failed.");
        const anotherSupplier = await insert(
            "INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Other supplier', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            [`SR-O-${data.token}`],
        );
        expect(await service.update(data.context, created.id, { toBranchId: anotherSupplier,
            items: [{ productSizeId: "9223372036854775807", quantity: 1 }] }))
            .toEqual({ kind: "variant_not_found" });
        const rows = await sequelize.query<{ toBranchId: string; quantity: number; historyCount: string }>(
            `SELECT sr.to_branch_id AS toBranchId, si.quantity,
                    (SELECT COUNT(*) FROM stock_request_history h WHERE h.stock_request_id = sr.id) AS historyCount
             FROM stock_requests sr JOIN stock_request_items si ON si.stock_request_id = sr.id WHERE sr.id = ?`,
            { replacements: [created.id], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ toBranchId: data.supplierId, quantity: 2, historyCount: "1" });
    });

    it("approves once and creates a linked pending transfer in the reverse branch direction", async () => {
        const data = await fixture();
        const created = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: data.variantId, quantity: 2 }] });
        if (created.kind !== "created") throw Error("Stock request fixture failed.");
        const admin: V2AccessContext = { ...data.context, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["stock_request.manage.branch"] }] };
        const decision = new StockRequestDecisionV2Service({ repository:
            new SequelizeStockRequestDecisionV2Repository(createSalesV2Persistence(sequelize)) });
        const outcomes = await Promise.all([decision.approve(admin, created.id), decision.approve(admin, created.id)]);
        expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["approved", "request_already_processed"]);
        const approved = outcomes.find((outcome) => outcome.kind === "approved");
        if (!approved || approved.kind !== "approved") return;
        const rows = await sequelize.query<{ requestStatus: string; receiptStatus: string;
            fromBranchId: string; toBranchId: string; quantity: number; historyCount: string }>(
            `SELECT sr.status AS requestStatus, tr.status AS receiptStatus,
                    tr.from_branch_id AS fromBranchId, tr.to_branch_id AS toBranchId, ti.quantity,
                    (SELECT COUNT(*) FROM stock_request_history h WHERE h.stock_request_id = sr.id) AS historyCount
             FROM stock_requests sr JOIN transfer_receipts tr ON tr.stock_request_id = sr.id
             JOIN transfer_receipt_items ti ON ti.transfer_receipt_id = tr.id WHERE sr.id = ?`,
            { replacements: [created.id], type: QueryTypes.SELECT });
        expect(rows).toEqual([{ requestStatus: "approved", receiptStatus: "pending",
            fromBranchId: data.supplierId, toBranchId: data.requesterId,
            quantity: 2, historyCount: "2" }]);
    });

    it("rejects a pending request with audit note and never creates a transfer", async () => {
        const data = await fixture();
        const created = await service.create(data.context, { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, items: [{ productSizeId: data.variantId, quantity: 2 }] });
        if (created.kind !== "created") throw Error("Stock request fixture failed.");
        const admin: V2AccessContext = { ...data.context, grants: [{ roleCode: "SUPER_ADMIN",
            scope: { type: "global" }, permissions: ["stock_request.manage.branch"] }] };
        const decision = new StockRequestDecisionV2Service({ repository:
            new SequelizeStockRequestDecisionV2Repository(createSalesV2Persistence(sequelize)) });
        expect(await decision.reject(admin, created.id, "Not needed")).toEqual({ kind: "rejected" });
        expect(await decision.reject(admin, created.id, "Not needed")).toEqual({ kind: "request_already_processed" });
        const rows = await sequelize.query<{ status: string; note: string; transferCount: string }>(
            `SELECT sr.status, h.note,
                    (SELECT COUNT(*) FROM transfer_receipts tr WHERE tr.stock_request_id = sr.id) AS transferCount
             FROM stock_requests sr JOIN stock_request_history h ON h.stock_request_id = sr.id
             WHERE sr.id = ? AND h.action = 'REJECTED'`,
            { replacements: [created.id], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ status: "rejected", note: "Not needed", transferCount: "0" });
    });

    it("keeps legacy routes and envelopes while enforcing V2 auth scope and DTO validation", async () => {
        const data = await fixture();
        let context = data.context;
        const decision = new StockRequestDecisionV2Service({ repository:
            new SequelizeStockRequestDecisionV2Repository(createSalesV2Persistence(sequelize)) });
        const app = express();
        app.use(express.json());
        app.use("/api/v1", createStockRequestV2Router({ service, decision, auth: (req, _res, next) => {
            (req as typeof req & { v2AccessContext: V2AccessContext }).v2AccessContext = context;
            next();
        } }));
        const payload = { fromBranchId: data.requesterId, toBranchId: data.supplierId,
            items: [{ productSizeId: data.variantId, quantity: 2 }] };
        expect((await request(app).post("/api/v1/stock-requests").send({ ...payload,
            items: [{ productSizeId: Number(data.variantId), quantity: 2 }] })).status).toBe(400);
        const created = await request(app).post("/api/v1/stock-requests").send(payload);
        expect(created.status).toBe(200);
        expect(created.body).toMatchObject({ EC: 0, DT: { fromBranchId: data.requesterId,
            toBranchId: data.supplierId, status: "pending" } });
        const listed = await request(app).get(`/api/v1/stock-requests/my/${data.requesterId}`);
        expect(listed.status).toBe(403); // This actor has manage, not read, grant.
        const forbidden = await request(app).get(`/api/v1/stock-requests/my/${data.supplierId}`);
        expect(forbidden.status).toBe(403);
        context = { ...data.context, grants: [{ roleCode: "BRANCH_MANAGER",
            scope: { type: "branch", branchId: data.requesterId },
            permissions: ["stock_request.read.branch", "stock_request.manage.branch"] }] };
        const branchPage = await request(app).get(`/api/v1/stock-requests/my/${data.requesterId}?page=1&limit=20`);
        expect(branchPage.status).toBe(200);
        expect(branchPage.body.DT).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: created.body.DT.id, fromBranch: { id: data.requesterId, name: "Requester" } }),
        ]));
        expect((await request(app).put(`/api/v1/stock-requests/${created.body.DT.id}`)
            .send({ items: [{ productSizeId: data.variantId, quantity: 4 }] })).status).toBe(200);
        expect((await request(app).post(`/api/v1/admin/stock-requests/${created.body.DT.id}/approve`)).status).toBe(403);
        context = { ...data.context, grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" },
            permissions: ["stock_request.read.branch", "stock_request.manage.branch"] }] };
        const pending = await request(app).get("/api/v1/admin/stock-requests/pending?page=1&limit=20");
        expect(pending.status).toBe(200);
        expect(pending.body.DT).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: created.body.DT.id, status: "pending" }),
        ]));
        const approved = await request(app).post(`/api/v1/admin/stock-requests/${created.body.DT.id}/approve`);
        expect(approved.status).toBe(200);
        expect(approved.body.DT).toMatchObject({ stockRequestId: created.body.DT.id });
        expect((await request(app).delete(`/api/v1/stock-requests/${created.body.DT.id}`)).status).toBe(409);
        expect((await request(app).post(`/api/v1/admin/stock-requests/${created.body.DT.id}/reject`)
            .send({ note: "Too late" })).status).toBe(409);
    });
});
