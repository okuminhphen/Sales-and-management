import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { SequelizeVoucherClaimV2Repository } from "../../src/modules/commerce/persistence/voucher-claim-v2.repository.js";
import { SequelizeVoucherTransitionV2Repository } from "../../src/modules/commerce/persistence/voucher-transition-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 voucher claim on MySQL", () => {
    let sequelize: Sequelize;
    let branchId: string;
    let otherBranchId: string;
    let customerId: string;
    let otherCustomerId: string;
    let actorAccountId: string;
    let suffix: string;

    const one = async <Row extends object>(sql: string, replacements: unknown[]): Promise<Row> => {
        const rows = await sequelize.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Missing voucher claim fixture row.");
        return rows[0];
    };

    const createOrder = async (options: {
        customerId?: string | null; branchId?: string; discount?: string; channel?: "online" | "in_store";
    } = {}): Promise<string> => {
        const key = crypto.randomUUID();
        const channel = options.channel ?? "online";
        const discount = options.discount ?? "10.0000";
        await sequelize.query(
            `INSERT INTO orders (code, checkout_key, customer_id, fulfillment_branch_id, created_by_account_id,
                channel, fulfillment_type, fulfillment_status, status, currency, subtotal_amount,
                discount_amount, shipping_fee, total_amount, placed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'unfulfilled', 'pending', 'VND', '100.0000', ?, '0.0000',
                100.0000 - ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [
                `V-${key.slice(0, 20)}`, key, options.customerId === undefined ? customerId : options.customerId,
                options.branchId ?? branchId, channel === "in_store" ? actorAccountId : null, channel,
                channel === "in_store" ? "carry_out" : "store_pickup", discount, discount,
            ] },
        );
        return (await one<{ id: string }>("SELECT id FROM orders WHERE checkout_key = ?", [key])).id;
    };

    const createVoucher = async (options: {
        usageLimit?: number | null; perCustomerLimit?: number | null; branchScope?: "all" | "selected";
        channel?: "all" | "online" | "in_store";
    } = {}): Promise<string> => {
        const code = `V-${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
        await sequelize.query(
            `INSERT INTO vouchers (code, discount_type, discount_value, min_order_amount,
                usage_limit, per_customer_limit, applies_to_channel, branch_scope, starts_at, ends_at,
                status, created_at, updated_at)
             VALUES (?, 'fixed', '10.0000', '0.0000', ?, ?, ?, ?,
                UTC_TIMESTAMP(3) - INTERVAL 1 DAY, UTC_TIMESTAMP(3) + INTERVAL 1 DAY,
                'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [code, options.usageLimit ?? null, options.perCustomerLimit ?? null,
                options.channel ?? "all", options.branchScope ?? "all"] },
        );
        return code;
    };

    const claim = async (orderId: string, code: string) => sequelize.transaction(async (transaction) =>
        new SequelizeVoucherClaimV2Repository(createSalesV2Persistence(sequelize), transaction)
            .claim({ orderId: serializeEntityId(orderId), code }));
    const transition = async (orderId: string, action: "redeem" | "release") =>
        sequelize.transaction(async (transaction) =>
            new SequelizeVoucherTransitionV2Repository(createSalesV2Persistence(sequelize), transaction)
                .transition({ orderId: serializeEntityId(orderId), action }));

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
    });

    beforeEach(async () => {
        suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        for (const code of [`VBR-A-${suffix}`, `VBR-B-${suffix}`]) {
            await sequelize.query(
                "INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, 'Voucher test', 'Test', 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                { replacements: [code] },
            );
        }
        branchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`VBR-A-${suffix}`])).id;
        otherBranchId = (await one<{ id: string }>("SELECT id FROM branches WHERE code = ?", [`VBR-B-${suffix}`])).id;
        for (const name of [`Voucher customer A ${suffix}`, `Voucher customer B ${suffix}`]) {
            await sequelize.query(
                "INSERT INTO customers (account_id, full_name, status, loyalty_points, created_at, updated_at) VALUES (NULL, ?, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
                { replacements: [name] },
            );
        }
        customerId = (await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [`Voucher customer A ${suffix}`])).id;
        otherCustomerId = (await one<{ id: string }>("SELECT id FROM customers WHERE full_name = ?", [`Voucher customer B ${suffix}`])).id;
        const email = `voucher-${suffix}@example.test`;
        await sequelize.query(
            "INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [email] },
        );
        actorAccountId = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = ?", [email])).id;
    });

    afterAll(async () => { await sequelize?.close(); });

    it("claims once and replays the same order without consuming quota again", async () => {
        const code = await createVoucher({ usageLimit: 1 });
        const orderId = await createOrder();
        const first = await claim(orderId, code);
        expect(first).toMatchObject({ kind: "claimed", discountAmount: "10.0000" });
        expect(await claim(orderId, code)).toEqual({ ...first, kind: "replayed" });
        const row = await one<{ total: number; status: string; voucherCodeSnapshot: string }>(
            "SELECT COUNT(*) AS total, MAX(status) AS status, MAX(voucher_code_snapshot) AS voucherCodeSnapshot FROM voucher_redemptions WHERE order_id = ?", [orderId],
        );
        expect(Number(row.total)).toBe(1);
        expect(row.status).toBe("reserved");
        expect(row.voucherCodeSnapshot).toBe(code);
    });

    it("replays a committed claim despite an older checkout snapshot", async () => {
        const code = await createVoucher({ usageLimit: 1 });
        const orderId = await createOrder();
        await sequelize.transaction(async (transaction) => {
            await sequelize.query("SELECT COUNT(*) FROM voucher_redemptions", {
                transaction, type: QueryTypes.SELECT,
            });
            expect((await claim(orderId, code)).kind).toBe("claimed");
            const replay = await new SequelizeVoucherClaimV2Repository(createSalesV2Persistence(sequelize), transaction)
                .claim({ orderId: serializeEntityId(orderId), code });
            expect(replay.kind).toBe("replayed");
        });
    });

    it("serializes two orders competing for the last global use", async () => {
        const code = await createVoucher({ usageLimit: 1 });
        const firstOrder = await createOrder();
        const secondOrder = await createOrder({ customerId: otherCustomerId });
        const results = await Promise.all([claim(firstOrder, code), claim(secondOrder, code)]);
        expect(results.map((result) => result.kind).sort()).toEqual(["claimed", "quota_exhausted"]);
    });

    it("enforces per-customer quota while another customer can still claim", async () => {
        const code = await createVoucher({ perCustomerLimit: 1 });
        expect((await claim(await createOrder(), code)).kind).toBe("claimed");
        expect(await claim(await createOrder(), code)).toEqual({ kind: "customer_quota_exhausted" });
        expect((await claim(await createOrder({ customerId: otherCustomerId }), code)).kind).toBe("claimed");
    });

    it("fails closed for selected branches with no assignment and rejects channel mismatch", async () => {
        const code = await createVoucher({ branchScope: "selected", channel: "online" });
        const orderId = await createOrder({ branchId: otherBranchId });
        expect(await claim(orderId, code)).toEqual({ kind: "voucher_not_eligible" });
        const voucher = await one<{ id: string }>("SELECT id FROM vouchers WHERE code = ?", [code]);
        await sequelize.query("INSERT INTO voucher_branches (voucher_id, branch_id) VALUES (?, ?)", {
            replacements: [voucher.id, branchId],
        });
        expect(await claim(orderId, code)).toEqual({ kind: "voucher_not_eligible" });
        const eligibleOrder = await createOrder();
        expect((await claim(eligibleOrder, code)).kind).toBe("claimed");
        const posOrder = await createOrder({ channel: "in_store" });
        expect(await claim(posOrder, code)).toEqual({ kind: "voucher_not_eligible" });
    });

    it("requires a customer identity when the voucher has a per-customer limit", async () => {
        const code = await createVoucher({ perCustomerLimit: 1 });
        const guestOrder = await createOrder({ customerId: null, channel: "in_store" });
        expect(await claim(guestOrder, code)).toEqual({ kind: "voucher_not_eligible" });
    });

    it("rejects an inactive or expired voucher without writing a redemption", async () => {
        const code = await createVoucher();
        const orderId = await createOrder();
        await sequelize.query("UPDATE vouchers SET status = 'inactive' WHERE code = ?", { replacements: [code] });
        expect(await claim(orderId, code)).toEqual({ kind: "voucher_not_eligible" });
        await sequelize.query(
            "UPDATE vouchers SET status = 'active', starts_at = UTC_TIMESTAMP(3) - INTERVAL 2 DAY, ends_at = UTC_TIMESTAMP(3) - INTERVAL 1 DAY WHERE code = ?",
            { replacements: [code] },
        );
        const window = await one<{ activeWindow: number }>(
            "SELECT (starts_at <= UTC_TIMESTAMP(3) AND ends_at > UTC_TIMESTAMP(3)) AS activeWindow FROM vouchers WHERE code = ?",
            [code],
        );
        expect(Number(window.activeWindow)).toBe(0);
        expect(await claim(orderId, code)).toEqual({ kind: "voucher_not_eligible" });
        const row = await one<{ total: number }>("SELECT COUNT(*) AS total FROM voucher_redemptions WHERE order_id = ?", [orderId]);
        expect(Number(row.total)).toBe(0);
    });

    it("rolls claim back with the owning checkout transaction", async () => {
        const code = await createVoucher({ usageLimit: 1 });
        const orderId = await createOrder();
        await expect(sequelize.transaction(async (transaction) => {
            const result = await new SequelizeVoucherClaimV2Repository(createSalesV2Persistence(sequelize), transaction)
                .claim({ orderId: serializeEntityId(orderId), code });
            expect(result.kind).toBe("claimed");
            throw new Error("checkout failed after voucher claim");
        })).rejects.toThrow("checkout failed after voucher claim");
        const row = await one<{ total: number }>("SELECT COUNT(*) AS total FROM voucher_redemptions WHERE order_id = ?", [orderId]);
        expect(Number(row.total)).toBe(0);
        expect((await claim(orderId, code)).kind).toBe("claimed");
    });

    it("rejects an order whose persisted discount differs from the server calculation", async () => {
        const code = await createVoucher();
        const orderId = await createOrder({ discount: "9.0000" });
        expect(await claim(orderId, code)).toEqual({ kind: "discount_mismatch" });
        const row = await one<{ total: number }>("SELECT COUNT(*) AS total FROM voucher_redemptions WHERE order_id = ?", [orderId]);
        expect(Number(row.total)).toBe(0);
    });

    it("redeems after confirmation and releases quota once when cancelled before handoff", async () => {
        const code = await createVoucher({ usageLimit: 1 });
        const orderId = await createOrder();
        expect((await claim(orderId, code)).kind).toBe("claimed");
        await sequelize.query("UPDATE orders SET status = 'confirmed' WHERE id = ?", { replacements: [orderId] });
        expect(await transition(orderId, "redeem")).toEqual({ kind: "redeemed" });
        expect(await transition(orderId, "redeem")).toEqual({ kind: "replayed" });
        await sequelize.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", { replacements: [orderId] });
        expect(await transition(orderId, "release")).toEqual({ kind: "released" });
        expect(await transition(orderId, "release")).toEqual({ kind: "replayed" });
        const row = await one<{ status: string; redeemedAt: Date | null; releasedAt: Date | null }>(
            "SELECT status, redeemed_at AS redeemedAt, released_at AS releasedAt FROM voucher_redemptions WHERE order_id = ?", [orderId],
        );
        expect(row).toMatchObject({ status: "released" });
        expect(row.redeemedAt).not.toBeNull();
        expect(row.releasedAt).not.toBeNull();
        expect((await claim(await createOrder({ customerId: otherCustomerId }), code)).kind).toBe("claimed");
    });

    it("refuses release before cancellation and after handoff", async () => {
        const code = await createVoucher();
        const orderId = await createOrder();
        expect((await claim(orderId, code)).kind).toBe("claimed");
        expect(await transition(orderId, "release")).toEqual({ kind: "transition_not_allowed" });
        await sequelize.query("UPDATE orders SET status = 'cancelled', fulfillment_status = 'shipping' WHERE id = ?", {
            replacements: [orderId],
        });
        expect(await transition(orderId, "release")).toEqual({ kind: "transition_not_allowed" });
        const row = await one<{ status: string }>("SELECT status FROM voucher_redemptions WHERE order_id = ?", [orderId]);
        expect(row.status).toBe("reserved");
    });

    it("serializes concurrent release attempts and never makes quota negative", async () => {
        const code = await createVoucher({ usageLimit: 1 });
        const orderId = await createOrder();
        expect((await claim(orderId, code)).kind).toBe("claimed");
        await sequelize.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", { replacements: [orderId] });
        const results = await Promise.all([transition(orderId, "release"), transition(orderId, "release")]);
        expect(results.map((result) => result.kind).sort()).toEqual(["released", "replayed"]);
        const row = await one<{ total: number }>(
            "SELECT COUNT(*) AS total FROM voucher_redemptions WHERE order_id = ? AND status = 'released'", [orderId],
        );
        expect(Number(row.total)).toBe(1);
        expect((await claim(await createOrder({ customerId: otherCustomerId }), code)).kind).toBe("claimed");
    });
});
