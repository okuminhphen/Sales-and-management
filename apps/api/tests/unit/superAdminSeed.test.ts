import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import superAdminSeed from "../../src/seeders/20251111142033-seed-super-admin.js";

describe("super admin seed", () => {
    const originalEmail = process.env.SUPER_ADMIN_EMAIL;
    const originalPassword = process.env.SUPER_ADMIN_PASSWORD;

    beforeEach(() => {
        process.env.SUPER_ADMIN_EMAIL = "admin@example.test";
        process.env.SUPER_ADMIN_PASSWORD = "test-password";
    });

    afterEach(() => {
        process.env.SUPER_ADMIN_EMAIL = originalEmail;
        process.env.SUPER_ADMIN_PASSWORD = originalPassword;
    });

    it("does not insert a duplicate admin when the configured email already exists", async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce([[{ id: 1 }], undefined])
            .mockResolvedValueOnce([[{ id: 10 }], undefined]);
        const bulkInsert = vi.fn();
        const queryInterface = {
            sequelize: { query },
            bulkInsert,
        };

        await superAdminSeed.up(queryInterface as never, {} as never);

        expect(query).toHaveBeenCalledTimes(2);
        expect(bulkInsert).not.toHaveBeenCalled();
    });
});
