import { QueryTypes, Sequelize } from "sequelize";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import {
    PAYMENT_METHOD_SEEDS,
    PERMISSION_SEEDS,
    ROLE_SEEDS,
    seedV2Database,
} from "../../src/database/v2/seed.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-seed-admin@example.test",
    password: "test-only-seed-password-not-a-secret",
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 seed on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(
            env.V2_MIGRATIONS_TARGET_DATABASE,
            env.MYSQL_USER,
            env.MYSQL_PASSWORD,
            { host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false },
        );
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("is idempotent and grants all seeded permissions only to SUPER_ADMIN", async () => {
        await seedV2Database(sequelize, superAdmin);
        const firstPasswordHash = await sequelize.query<{ passwordHash: string }>(
            "SELECT password_hash AS passwordHash FROM accounts WHERE email = ?",
            { replacements: [superAdmin.email], type: QueryTypes.SELECT },
        );
        await seedV2Database(sequelize, superAdmin);

        const [roles, permissions, paymentMethods, accounts, assignments, grants, nonSuperAdminGrants] = await Promise.all([
            sequelize.query<{ total: number }>("SELECT COUNT(*) AS total FROM roles", { type: QueryTypes.SELECT }),
            sequelize.query<{ total: number }>("SELECT COUNT(*) AS total FROM permissions", { type: QueryTypes.SELECT }),
            sequelize.query<{ total: number }>("SELECT COUNT(*) AS total FROM payment_methods", { type: QueryTypes.SELECT }),
            sequelize.query<{ total: number; passwordHash: string; status: string }>("SELECT COUNT(*) AS total, MAX(password_hash) AS passwordHash, MAX(status) AS status FROM accounts WHERE email = ?", {
                replacements: [superAdmin.email], type: QueryTypes.SELECT,
            }),
            sequelize.query<{ total: number }>(
                "SELECT COUNT(*) AS total FROM account_roles ar INNER JOIN accounts a ON a.id = ar.account_id INNER JOIN roles r ON r.id = ar.role_id WHERE a.email = ? AND r.code = 'SUPER_ADMIN' AND ar.scope_key = 'GLOBAL'",
                { replacements: [superAdmin.email], type: QueryTypes.SELECT },
            ),
            sequelize.query<{ total: number }>(
                "SELECT COUNT(*) AS total FROM role_permissions rp INNER JOIN roles r ON r.id = rp.role_id WHERE r.code = 'SUPER_ADMIN'",
                { type: QueryTypes.SELECT },
            ),
            sequelize.query<{ total: number }>(
                "SELECT COUNT(*) AS total FROM role_permissions rp INNER JOIN roles r ON r.id = rp.role_id WHERE r.code <> 'SUPER_ADMIN'",
                { type: QueryTypes.SELECT },
            ),
        ]);

        expect(roles[0]?.total).toBe(ROLE_SEEDS.length);
        expect(permissions[0]?.total).toBe(PERMISSION_SEEDS.length);
        expect(paymentMethods[0]?.total).toBe(PAYMENT_METHOD_SEEDS.length);
        expect(accounts[0]?.total).toBe(1);
        expect(accounts[0]?.status).toBe("active");
        expect(accounts[0]?.passwordHash).toBe(firstPasswordHash[0]?.passwordHash);
        await expect(bcrypt.compare(superAdmin.password, accounts[0]?.passwordHash ?? "")).resolves.toBe(true);
        expect(assignments[0]?.total).toBe(1);
        expect(grants[0]?.total).toBe(PERMISSION_SEEDS.length);
        expect(nonSuperAdminGrants[0]?.total).toBe(0);
    });
});
