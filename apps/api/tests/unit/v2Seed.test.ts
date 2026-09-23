import { describe, expect, it, vi } from "vitest";
import type { Sequelize, Transaction } from "sequelize";
import { seedV2Database } from "../../src/database/v2/seed.js";

describe("seedV2Database", () => {
    it("retries a transient MySQL deadlock for the entire seed transaction", async () => {
        const deadlock = Object.assign(new Error("deadlock"), {
            parent: { code: "ER_LOCK_DEADLOCK" },
        });
        let attempts = 0;
        const query = vi.fn(async () => undefined);
        const transaction = vi.fn(async (work: (transaction: Transaction) => Promise<void>) => {
            if (attempts === 0) {
                attempts += 1;
                throw deadlock;
            }
            attempts += 1;
            await work({} as Transaction);
        });
        const sequelize = { query, transaction } as unknown as Sequelize;

        await expect(seedV2Database(sequelize, {
            email: "concurrent-seed@example.test",
            password: "test-only-seed-retry-password",
        })).resolves.toBeUndefined();

        expect(transaction).toHaveBeenCalledTimes(2);
        expect(query).toHaveBeenCalled();
    });
});
