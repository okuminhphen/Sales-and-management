import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { InventoryTransferReservationV2Service } from "../../src/modules/inventory-transfer/application/inventory-transfer-reservation-v2.service.js";
import { SequelizeInventoryTransferDispatchV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-transfer-dispatch-v2.repository.js";
import { SequelizeInventoryTransferReservationV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-transfer-reservation-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("Database V2 transfer reservation on MySQL", () => {
    let sequelize: Sequelize;
    let service: InventoryTransferReservationV2Service;
    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw Error("An explicit _test database is required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await sequelize.authenticate();
        service = new InventoryTransferReservationV2Service({ repository:
            new SequelizeInventoryTransferReservationV2Repository(createSalesV2Persistence(sequelize)) });
    });
    afterAll(async () => { await sequelize?.close(); });

    const insert = async (sql: string, replacements: unknown[]): Promise<string> => {
        const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
        return String(id);
    };
    const fixture = async (stock: number) => {
        const token = randomUUID().replace(/-/g, "").slice(0, 12);
        const accountId = await insert("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`transfer-${token}@example.invalid`]);
        const supplierId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Supplier', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TS-${token}`]);
        const recipientId = await insert("INSERT INTO branches (code, name, address, created_at, updated_at) VALUES (?, 'Recipient', 'Test', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TR-${token}`]);
        const categoryId = await insert("INSERT INTO categories (code, name, slug, created_at, updated_at) VALUES (?, 'Transfer', ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TC-${token}`, `tc-${token}`]);
        const productId = await insert("INSERT INTO products (category_id, name, slug, base_price, created_at, updated_at) VALUES (?, 'Transfer', ?, '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [categoryId, `tp-${token}`]);
        const sizeId = await insert("INSERT INTO sizes (name, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TZ-${token}`]);
        const variantId = await insert("INSERT INTO product_variants (product_id, size_id, sku, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [productId, sizeId, `TV-${token}`]);
        const inventoryId = await insert("INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [supplierId, variantId, stock]);
        const requestId = await insert("INSERT INTO stock_requests (code, from_branch_id, to_branch_id, status, created_by_account_id, approved_by_account_id, approved_at, created_at, updated_at) VALUES (?, ?, ?, 'approved', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`TREQ-${token}`, recipientId, supplierId, accountId, accountId]);
        await insert("INSERT INTO stock_request_items (stock_request_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [requestId, variantId]);
        const createTransferItem = async (number: number, status = "approved") => {
            const receiptId = await insert("INSERT INTO transfer_receipts (stock_request_id, code, from_branch_id, to_branch_id, status, created_by_account_id, approved_by_account_id, approved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [requestId, `TREC-${number}-${token}`, supplierId, recipientId, status, accountId, accountId]);
            return insert("INSERT INTO transfer_receipt_items (transfer_receipt_id, product_variant_id, quantity, created_at, updated_at) VALUES (?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [receiptId, variantId]);
        };
        const firstItemId = await createTransferItem(1);
        const secondItemId = await createTransferItem(2);
        const pendingItemId = await createTransferItem(3, "pending");
        return { token, accountId, inventoryId, firstItemId, secondItemId, pendingItemId };
    };

    it("holds supplier stock without dispatching it, and replays only the matching key", async () => {
        const data = await fixture(1);
        expect(await service.reserveTransferItem({ transferItemId: data.pendingItemId, idempotencyKey: `pending-${data.token}` }))
            .toEqual({ kind: "transfer_item_not_approvable" });
        const key = `transfer-${data.token}`;
        const first = await service.reserveTransferItem({ transferItemId: data.firstItemId, idempotencyKey: key });
        expect(first).toMatchObject({ kind: "reserved", quantity: 1 });
        expect(await service.reserveTransferItem({ transferItemId: data.firstItemId, idempotencyKey: key }))
            .toEqual({ ...first, kind: "replayed" });
        expect(await service.reserveTransferItem({ transferItemId: data.secondItemId, idempotencyKey: key }))
            .toEqual({ kind: "idempotency_conflict" });
        expect(await service.reserveTransferItem({ transferItemId: data.firstItemId, idempotencyKey: `different-${data.token}` }))
            .toEqual({ kind: "already_reserved" });
        expect(await service.reserveTransferItem({ transferItemId: data.secondItemId, idempotencyKey: `second-${data.token}` }))
            .toEqual({ kind: "insufficient_stock" });
        const rows = await sequelize.query<{ stock: number; holds: string; confirmed: string }>(
            `SELECT i.stock, (SELECT COUNT(*) FROM inventory_reservations r WHERE r.inventory_id = i.id AND r.status = 'active') AS holds,
                    (SELECT COUNT(*) FROM inventory_reservations r WHERE r.inventory_id = i.id AND r.confirmed_at IS NOT NULL AND r.expires_at IS NULL) AS confirmed
             FROM inventories i WHERE i.id = ?`,
            { replacements: [data.inventoryId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ stock: 1, holds: "1", confirmed: "1" });
    });

    it("joins the receipt approval transaction so a rollback removes its hold", async () => {
        const data = await fixture(1);
        const key = `transfer-rollback-${data.token}`;
        const marker = Error("rollback approval");
        await expect(sequelize.transaction(async (transaction) => {
            const repository = new SequelizeInventoryTransferReservationV2Repository(createSalesV2Persistence(sequelize), transaction);
            expect(await repository.reserveTransferItem({ transferItemId: serializeEntityId(data.firstItemId), idempotencyKey: key }))
                .toMatchObject({ kind: "reserved", quantity: 1 });
            throw marker;
        })).rejects.toBe(marker);
        const rows = await sequelize.query<{ count: string }>(
            "SELECT COUNT(*) AS count FROM inventory_reservations WHERE idempotency_key = ?",
            { replacements: [key], type: QueryTypes.SELECT },
        );
        expect(rows[0]?.count).toBe("0");
    });

    it("serializes two transfer approvals competing for the last unit", async () => {
        const data = await fixture(1);
        const results = await Promise.all([
            service.reserveTransferItem({ transferItemId: data.firstItemId, idempotencyKey: `race-a-${data.token}` }),
            service.reserveTransferItem({ transferItemId: data.secondItemId, idempotencyKey: `race-b-${data.token}` }),
        ]);
        expect(results.map((result) => result.kind).sort()).toEqual(["insufficient_stock", "reserved"]);
        const rows = await sequelize.query<{ holds: string; stock: number }>(
            `SELECT stock, (SELECT COUNT(*) FROM inventory_reservations r WHERE r.inventory_id = i.id AND r.status = 'active') AS holds
             FROM inventories i WHERE i.id = ?`,
            { replacements: [data.inventoryId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toEqual({ holds: "1", stock: 1 });
    });

    it("dispatches a confirmed source hold exactly once with a typed transfer movement", async () => {
        const data = await fixture(1);
        const hold = await service.reserveTransferItem({ transferItemId: data.firstItemId,
            idempotencyKey: `dispatch-hold-${data.token}` });
        if (hold.kind !== "reserved") throw Error("Transfer hold fixture failed.");
        const repository = new SequelizeInventoryTransferDispatchV2Repository(createSalesV2Persistence(sequelize));
        const key = `dispatch-${data.token}`;
        const actorId = serializeEntityId(data.accountId);
        expect(await repository.dispatchTransferItem(serializeEntityId(data.firstItemId), key, actorId))
            .toEqual({ kind: "transfer_item_not_dispatchable" });
        await sequelize.query("UPDATE transfer_receipts SET status = 'in_transit', dispatched_at = CURRENT_TIMESTAMP(3) WHERE id = (SELECT transfer_receipt_id FROM transfer_receipt_items WHERE id = ?)",
            { replacements: [data.firstItemId] });
        expect(await repository.dispatchTransferItem(serializeEntityId(data.firstItemId), key, actorId))
            .toEqual({ kind: "dispatched", balanceAfter: 0 });
        expect(await repository.dispatchTransferItem(serializeEntityId(data.firstItemId), key, actorId))
            .toEqual({ kind: "replayed", balanceAfter: 0 });
        await sequelize.query("UPDATE transfer_receipts SET status = 'in_transit', dispatched_at = CURRENT_TIMESTAMP(3) WHERE id = (SELECT transfer_receipt_id FROM transfer_receipt_items WHERE id = ?)",
            { replacements: [data.secondItemId] });
        expect(await repository.dispatchTransferItem(serializeEntityId(data.secondItemId), key, actorId))
            .toEqual({ kind: "idempotency_conflict" });
        await sequelize.query("UPDATE transfer_receipts SET status = 'completed', completed_at = CURRENT_TIMESTAMP(3) WHERE id = (SELECT transfer_receipt_id FROM transfer_receipt_items WHERE id = ?)",
            { replacements: [data.firstItemId] });
        await sequelize.query("UPDATE stock_requests SET status = 'fulfilled' WHERE id = (SELECT tr.stock_request_id FROM transfer_receipts tr JOIN transfer_receipt_items ti ON ti.transfer_receipt_id = tr.id WHERE ti.id = ?)",
            { replacements: [data.firstItemId] });
        expect(await repository.dispatchTransferItem(serializeEntityId(data.firstItemId), key, actorId))
            .toEqual({ kind: "replayed", balanceAfter: 0 });
        const rows = await sequelize.query<{ stock: number; status: string; movements: string; actorId: string }>(
            `SELECT i.stock, r.status,
                    (SELECT COUNT(*) FROM inventory_movements m WHERE m.transfer_receipt_item_id = ? AND m.quantity_delta = -1 AND m.reference_type = 'transfer_receipt') AS movements,
                    (SELECT created_by_account_id FROM inventory_movements m WHERE m.idempotency_key = ?) AS actorId
             FROM inventories i JOIN inventory_reservations r ON r.inventory_id = i.id
             WHERE i.id = ? AND r.id = ?`,
            { replacements: [data.firstItemId, key, data.inventoryId, hold.reservationId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ stock: 0, status: "consumed", movements: "1", actorId: data.accountId });
    });

    it("rolls back dispatch with its owner transaction", async () => {
        const data = await fixture(1);
        const hold = await service.reserveTransferItem({ transferItemId: data.firstItemId,
            idempotencyKey: `dispatch-rollback-hold-${data.token}` });
        if (hold.kind !== "reserved") throw Error("Transfer hold fixture failed.");
        const key = `dispatch-rollback-${data.token}`;
        const marker = Error("rollback dispatch");
        await expect(sequelize.transaction(async (transaction) => {
            await sequelize.query("UPDATE transfer_receipts SET status = 'in_transit', dispatched_at = CURRENT_TIMESTAMP(3) WHERE id = (SELECT transfer_receipt_id FROM transfer_receipt_items WHERE id = ?)",
                { replacements: [data.firstItemId], transaction });
            const scoped = new SequelizeInventoryTransferDispatchV2Repository(createSalesV2Persistence(sequelize), transaction);
            expect(await scoped.dispatchTransferItem(serializeEntityId(data.firstItemId), key, serializeEntityId(data.accountId)))
                .toEqual({ kind: "dispatched", balanceAfter: 0 });
            throw marker;
        })).rejects.toBe(marker);
        const rows = await sequelize.query<{ stock: number; status: string; movements: string }>(
            `SELECT i.stock, r.status, (SELECT COUNT(*) FROM inventory_movements WHERE idempotency_key = ?) AS movements
             FROM inventories i JOIN inventory_reservations r ON r.inventory_id = i.id WHERE r.id = ?`,
            { replacements: [key, hold.reservationId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ stock: 1, status: "active", movements: "0" });
    });

    it("serializes duplicate dispatch attempts without double-debiting stock", async () => {
        const data = await fixture(1);
        const hold = await service.reserveTransferItem({ transferItemId: data.firstItemId,
            idempotencyKey: `dispatch-race-hold-${data.token}` });
        if (hold.kind !== "reserved") throw Error("Transfer hold fixture failed.");
        await sequelize.query("UPDATE transfer_receipts SET status = 'in_transit', dispatched_at = CURRENT_TIMESTAMP(3) WHERE id = (SELECT transfer_receipt_id FROM transfer_receipt_items WHERE id = ?)",
            { replacements: [data.firstItemId] });
        const repository = new SequelizeInventoryTransferDispatchV2Repository(createSalesV2Persistence(sequelize));
        const id = serializeEntityId(data.firstItemId);
        const actor = serializeEntityId(data.accountId);
        const key = `dispatch-race-${data.token}`;
        const results = await Promise.all([
            repository.dispatchTransferItem(id, key, actor),
            repository.dispatchTransferItem(id, key, actor),
        ]);
        expect(results.map((result) => result.kind).sort()).toEqual(["dispatched", "replayed"]);
        const rows = await sequelize.query<{ stock: number; movements: string }>(
            `SELECT stock, (SELECT COUNT(*) FROM inventory_movements WHERE idempotency_key = ?) AS movements
             FROM inventories WHERE id = ?`,
            { replacements: [key, data.inventoryId], type: QueryTypes.SELECT });
        expect(rows[0]).toEqual({ stock: 0, movements: "1" });
    });
});
