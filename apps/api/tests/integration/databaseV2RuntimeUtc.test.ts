import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, type Transaction } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { assertV2RuntimeReady, createV2RuntimePersistence } from "../../src/database/v2/runtime.js";
import type { V2Persistence } from "../../src/database/v2/persistence.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 production runtime UTC on guarded MySQL", () => {
    let persistence: V2Persistence | undefined;

    beforeAll(async () => {
        const target = env.V2_MIGRATIONS_TARGET_DATABASE?.trim();
        // This guard runs before the migration runner or any SQL mutation.
        if (!target || !/^[a-zA-Z0-9_]+_test$/.test(target)) {
            throw new Error("Runtime UTC integration requires an explicit _test database.");
        }
        await runV2Migrations("up");
        const originalDatabase = env.MYSQL_DATABASE;
        try {
            env.MYSQL_DATABASE = target;
            persistence = createV2RuntimePersistence();
        } finally {
            env.MYSQL_DATABASE = originalDatabase;
        }
        await persistence.sequelize.authenticate();
        const [connection] = await persistence.sequelize.query<{ databaseName: string }>(
            "SELECT DATABASE() AS databaseName", { type: QueryTypes.SELECT },
        );
        if (connection?.databaseName !== target) {
            throw new Error("Runtime UTC integration refuses to mutate a non-test connection.");
        }
        await assertV2RuntimeReady(persistence);
    }, 30_000);

    afterAll(async () => { await persistence?.sequelize.close(); });

    const rollbackOnly = async (work: (transaction: Transaction) => Promise<void>): Promise<void> => {
        if (!persistence) throw new Error("Runtime test connection is not initialized.");
        const transaction = await persistence.sequelize.transaction();
        try {
            await work(transaction);
        } finally {
            await transaction.rollback();
        }
    };

    it("stores raw UTC_TIMESTAMP at the host epoch and reads the same ISO instant", async () => {
        const email = `runtime-raw-${crypto.randomUUID()}@example.test`;
        await rollbackOnly(async (transaction) => {
            const before = Date.now();
            await persistence!.sequelize.query(
                `INSERT INTO accounts (email, status, created_at, updated_at)
                 VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                { replacements: [email], transaction },
            );
            const [row] = await persistence!.sequelize.query<{ createdAt: Date; epoch: string | number }>(
                "SELECT created_at AS createdAt, UNIX_TIMESTAMP(created_at) AS epoch FROM accounts WHERE email = ?",
                { replacements: [email], transaction, type: QueryTypes.SELECT },
            );
            const epoch = Number(row.epoch) * 1_000;
            expect(epoch).toBeGreaterThanOrEqual(before - 5_000);
            expect(epoch).toBeLessThanOrEqual(Date.now() + 5_000);
            expect(row.createdAt).toBeInstanceOf(Date);
            expect(row.createdAt.toISOString()).toBe(new Date(epoch).toISOString());
        });
        const [row] = await persistence!.sequelize.query<{ count: number }>(
            "SELECT COUNT(*) AS count FROM accounts WHERE email = ?",
            { replacements: [email], type: QueryTypes.SELECT },
        );
        expect(Number(row.count)).toBe(0);
    });

    it("round-trips an ORM Date at the same persisted epoch", async () => {
        await rollbackOnly(async (transaction) => {
            const instant = new Date(Math.floor(Date.now() / 1_000) * 1_000);
            const email = `runtime-orm-${crypto.randomUUID()}@example.test`;
            const Account = persistence!.models.get("Account");
            await Account.create({
                email, status: "active", username: null, passwordHash: null,
                emailVerifiedAt: null, lastLoginAt: null, createdAt: instant, updatedAt: instant,
            }, { transaction });
            const saved = await Account.findOne({ where: { email }, transaction });
            const [row] = await persistence!.sequelize.query<{ epoch: string | number }>(
                "SELECT UNIX_TIMESTAMP(created_at) AS epoch FROM accounts WHERE email = ?",
                { replacements: [email], transaction, type: QueryTypes.SELECT },
            );

            expect(Number(row.epoch) * 1_000).toBe(instant.getTime());
            expect((saved!.get("createdAt") as Date).toISOString()).toBe(instant.toISOString());
        });
    });

    it("evaluates ORM-written active, future and expired voucher windows against UTC SQL", async () => {
        await rollbackOnly(async (transaction) => {
            const now = Math.floor(Date.now() / 1_000) * 1_000;
            const Voucher = persistence!.models.get("Voucher");
            const windows = [
                { label: "active", starts: -60_000, ends: 60_000, eligible: 1 },
                { label: "future", starts: 60_000, ends: 120_000, eligible: 0 },
                { label: "expired", starts: -120_000, ends: -60_000, eligible: 0 },
            ];
            for (const window of windows) {
                const code = `UTC-${crypto.randomUUID()}`;
                await Voucher.create({
                    code, description: null, discountType: "fixed", discountValue: "10.0000",
                    minOrderAmount: "0.0000", maxDiscountAmount: null, usageLimit: null,
                    perCustomerLimit: null, appliesToChannel: "all", branchScope: "all", status: "active",
                    startsAt: new Date(now + window.starts), endsAt: new Date(now + window.ends),
                    createdAt: new Date(now), updatedAt: new Date(now),
                }, { transaction });
                const [row] = await persistence!.sequelize.query<{ eligible: number; startEpoch: string | number }>(
                    `SELECT (starts_at <= UTC_TIMESTAMP(3) AND ends_at > UTC_TIMESTAMP(3)) AS eligible,
                            UNIX_TIMESTAMP(starts_at) AS startEpoch FROM vouchers WHERE code = ?`,
                    { replacements: [code], transaction, type: QueryTypes.SELECT },
                );
                expect(Number(row.startEpoch) * 1_000, window.label).toBe(now + window.starts);
                expect(Number(row.eligible), window.label).toBe(window.eligible);
            }
        });
    });
});
