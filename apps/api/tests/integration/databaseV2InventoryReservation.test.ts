import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { InventoryReservationV2Service } from "../../src/modules/inventory-transfer/application/inventory-reservation-v2.service.js";
import { SequelizeInventoryReservationV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-reservation-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

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
        const createItem = async (number: number): Promise<{ orderId: string; itemId: string }> => {
            const orderId = await insert("INSERT INTO orders (code, checkout_key, fulfillment_branch_id, created_by_account_id, channel, fulfillment_type, subtotal_amount, total_amount, placed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_store', 'carry_out', '100.0000', '100.0000', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`RESORD-${number}-${token}`, `rescheckout-${number}-${token}`, branchId, accountId]);
            const itemId = await insert("INSERT INTO order_items (order_id, product_variant_id, sku_snapshot, product_name_snapshot, size_name_snapshot, unit_price, quantity, line_total, created_at) VALUES (?, ?, 'SKU', 'Product', 'M', '100.0000', 1, '100.0000', UTC_TIMESTAMP(3))", [orderId, variantId]);
            return { orderId, itemId };
        };
        const first = await createItem(1);
        const second = await createItem(2);
        return { token, inventoryId, firstOrderId: first.orderId, firstItemId: first.itemId, secondItemId: second.itemId };
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

    it("joins the caller's checkout transaction so rollback removes the hold", async () => {
        const data = await fixture(1);
        const marker = new Error("rollback checkout fixture");
        await expect(sequelize.transaction(async (transaction) => {
            const scoped = new SequelizeInventoryReservationV2Repository(createSalesV2Persistence(sequelize), transaction);
            const result = await scoped.reserveOrderItem({ orderItemId: serializeEntityId(data.firstItemId),
                idempotencyKey: `atomic-${data.token}`, expiresAt: expiry() });
            expect(result.kind).toBe("reserved");
            throw marker;
        })).rejects.toBe(marker);
        const rows = await sequelize.query<{ count: string }>(
            "SELECT COUNT(*) AS count FROM inventory_reservations WHERE idempotency_key = ?",
            { replacements: [`atomic-${data.token}`], type: QueryTypes.SELECT },
        );
        expect(rows[0]?.count).toBe("0");
    });

    it("confirms a paid/confirmed order hold without reducing stock, and rolls back with its caller", async () => {
        const data = await fixture(1);
        const reserved = await service.reserveOrderItem({ orderItemId: data.firstItemId,
            idempotencyKey: `confirm-${data.token}`, expiresAt: expiry() });
        if (reserved.kind !== "reserved") throw Error("Reservation fixture failed.");
        const persistence = createSalesV2Persistence(sequelize);
        const repository = new SequelizeInventoryReservationV2Repository(persistence);
        expect(await repository.confirmOrderReservation(reserved.reservationId)).toEqual({ kind: "order_not_confirmed" });
        const marker = new Error("rollback confirmation fixture");
        await expect(sequelize.transaction(async (transaction) => {
            await sequelize.query("UPDATE orders SET status = 'confirmed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
                { replacements: [data.firstOrderId], transaction });
            const scoped = new SequelizeInventoryReservationV2Repository(persistence, transaction);
            expect(await scoped.confirmOrderReservation(reserved.reservationId)).toEqual({ kind: "confirmed" });
            throw marker;
        })).rejects.toBe(marker);
        const before = await sequelize.query<{ status: string; confirmedAt: Date | null; expiresAt: Date | null; stock: number }>(
            "SELECT r.status, r.confirmed_at AS confirmedAt, r.expires_at AS expiresAt, i.stock FROM inventory_reservations r JOIN inventories i ON i.id = r.inventory_id WHERE r.id = ?",
            { replacements: [reserved.reservationId], type: QueryTypes.SELECT },
        );
        expect(before[0]).toMatchObject({ status: "active", confirmedAt: null, stock: 1 });
        expect(before[0]?.expiresAt).not.toBeNull();
        await sequelize.query("UPDATE orders SET status = 'confirmed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [data.firstOrderId] });
        expect(await repository.confirmOrderReservation(reserved.reservationId)).toEqual({ kind: "confirmed" });
        expect(await repository.confirmOrderReservation(reserved.reservationId)).toEqual({ kind: "replayed" });
        const after = await sequelize.query<{ confirmedAt: Date | null; expiresAt: Date | null; stock: number }>(
            "SELECT r.confirmed_at AS confirmedAt, r.expires_at AS expiresAt, i.stock FROM inventory_reservations r JOIN inventories i ON i.id = r.inventory_id WHERE r.id = ?",
            { replacements: [reserved.reservationId], type: QueryTypes.SELECT },
        );
        expect(after[0]?.confirmedAt).not.toBeNull();
        expect(after[0]).toMatchObject({ expiresAt: null, stock: 1 });
    });

    it("refuses to confirm a hold whose deadline passed before the payment confirmation", async () => {
        const data = await fixture(1);
        const reserved = await service.reserveOrderItem({ orderItemId: data.firstItemId,
            idempotencyKey: `late-confirm-${data.token}`, expiresAt: expiry() });
        if (reserved.kind !== "reserved") throw Error("Reservation fixture failed.");
        await sequelize.query("UPDATE orders SET status = 'confirmed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [data.firstOrderId] });
        await sequelize.query("UPDATE inventory_reservations SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = ?",
            { replacements: [reserved.reservationId] });
        const repository = new SequelizeInventoryReservationV2Repository(createSalesV2Persistence(sequelize));
        expect(await repository.confirmOrderReservation(reserved.reservationId)).toEqual({ kind: "reservation_expired" });
        const rows = await sequelize.query<{ confirmedAt: Date | null; expiresAt: Date | null }>(
            "SELECT confirmed_at AS confirmedAt, expires_at AS expiresAt FROM inventory_reservations WHERE id = ?",
            { replacements: [reserved.reservationId], type: QueryTypes.SELECT },
        );
        expect(rows[0]?.confirmedAt).toBeNull();
        expect(rows[0]?.expiresAt).not.toBeNull();
    });

    it("releases only a cancelled pre-handover order with no unresolved payment", async () => {
        const data = await fixture(1);
        const reserved = await service.reserveOrderItem({ orderItemId: data.firstItemId,
            idempotencyKey: `release-${data.token}`, expiresAt: expiry() });
        if (reserved.kind !== "reserved") throw Error("Reservation fixture failed.");
        await sequelize.query("UPDATE orders SET status = 'cancelled', fulfillment_status = 'cancelled', cancelled_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [data.firstOrderId] });
        const methodId = await insert("INSERT INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES (?, 'Test', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [`RELPAY-${data.token}`]);
        const paymentId = await insert("INSERT INTO payments (order_id, payment_method_id, provider, merchant_reference, amount, status, created_at, updated_at) VALUES (?, ?, 'test', ?, '100.0000', 'processing', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))", [data.firstOrderId, methodId, `release-payment-${data.token}`]);
        const persistence = createSalesV2Persistence(sequelize);
        const repository = new SequelizeInventoryReservationV2Repository(persistence);
        expect(await repository.releaseCancelledOrderReservation(reserved.reservationId)).toEqual({ kind: "payment_unresolved" });
        await sequelize.query("UPDATE payments SET status = 'failed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [paymentId] });
        const marker = new Error("rollback release fixture");
        await expect(sequelize.transaction(async (transaction) => {
            const scoped = new SequelizeInventoryReservationV2Repository(persistence, transaction);
            expect(await scoped.releaseCancelledOrderReservation(reserved.reservationId)).toEqual({ kind: "released" });
            throw marker;
        })).rejects.toBe(marker);
        expect(await repository.releaseCancelledOrderReservation(reserved.reservationId)).toEqual({ kind: "released" });
        expect(await repository.releaseCancelledOrderReservation(reserved.reservationId)).toEqual({ kind: "replayed" });
        const rows = await sequelize.query<{ status: string; releasedAt: Date | null; stock: number }>(
            "SELECT r.status, r.released_at AS releasedAt, i.stock FROM inventory_reservations r JOIN inventories i ON i.id = r.inventory_id WHERE r.id = ?",
            { replacements: [reserved.reservationId], type: QueryTypes.SELECT },
        );
        expect(rows[0]).toMatchObject({ status: "released", stock: 1 });
        expect(rows[0]?.releasedAt).not.toBeNull();
    });

    it("consumes a confirmed hold at handover with one typed movement and no partial commit", async () => {
        const data = await fixture(1);
        const reserved = await service.reserveOrderItem({ orderItemId: data.firstItemId,
            idempotencyKey: `consume-hold-${data.token}`, expiresAt: expiry() });
        if (reserved.kind !== "reserved") throw Error("Reservation fixture failed.");
        const persistence = createSalesV2Persistence(sequelize);
        const repository = new SequelizeInventoryReservationV2Repository(persistence);
        const key = `consume-${data.token}`;
        expect(await repository.consumeOrderReservation(reserved.reservationId, key)).toEqual({ kind: "order_not_ready" });
        await sequelize.query("UPDATE orders SET status = 'confirmed', updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [data.firstOrderId] });
        expect(await repository.consumeOrderReservation(reserved.reservationId, key)).toEqual({ kind: "order_not_ready" });
        expect(await repository.confirmOrderReservation(reserved.reservationId)).toEqual({ kind: "confirmed" });
        const marker = new Error("rollback handover fixture");
        await expect(sequelize.transaction(async (transaction) => {
            await sequelize.query("UPDATE orders SET status = 'completed', fulfillment_status = 'fulfilled', fulfilled_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
                { replacements: [data.firstOrderId], transaction });
            const scoped = new SequelizeInventoryReservationV2Repository(persistence, transaction);
            expect(await scoped.consumeOrderReservation(reserved.reservationId, key)).toEqual({ kind: "consumed", balanceAfter: 0 });
            throw marker;
        })).rejects.toBe(marker);
        const before = await sequelize.query<{ stock: number; status: string; movements: string }>(
            "SELECT i.stock, r.status, (SELECT COUNT(*) FROM inventory_movements m WHERE m.idempotency_key = ?) AS movements FROM inventory_reservations r JOIN inventories i ON i.id = r.inventory_id WHERE r.id = ?",
            { replacements: [key, reserved.reservationId], type: QueryTypes.SELECT },
        );
        expect(before[0]).toEqual({ stock: 1, status: "active", movements: "0" });
        await sequelize.query("UPDATE orders SET status = 'completed', fulfillment_status = 'fulfilled', fulfilled_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [data.firstOrderId] });
        expect(await repository.consumeOrderReservation(reserved.reservationId, key)).toEqual({ kind: "consumed", balanceAfter: 0 });
        expect(await repository.consumeOrderReservation(reserved.reservationId, key)).toEqual({ kind: "replayed", balanceAfter: 0 });
        expect(await repository.consumeOrderReservation(reserved.reservationId, `other-${data.token}`)).toEqual({ kind: "reservation_finalized" });
        const after = await sequelize.query<{ stock: number; status: string; quantityDelta: number; balanceAfter: number; orderItemId: string; movements: string }>(
            "SELECT i.stock, r.status, m.quantity_delta AS quantityDelta, m.balance_after AS balanceAfter, m.order_item_id AS orderItemId, (SELECT COUNT(*) FROM inventory_movements mm WHERE mm.idempotency_key = ?) AS movements FROM inventory_reservations r JOIN inventories i ON i.id = r.inventory_id JOIN inventory_movements m ON m.idempotency_key = ? WHERE r.id = ?",
            { replacements: [key, key, reserved.reservationId], type: QueryTypes.SELECT },
        );
        expect(after[0]).toEqual({ stock: 0, status: "consumed", quantityDelta: -1,
            balanceAfter: 0, orderItemId: data.firstItemId, movements: "1" });
    });
});
