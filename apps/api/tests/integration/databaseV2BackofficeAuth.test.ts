import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { BackofficeAuthV2Service } from "../../src/modules/identity-access/application/backoffice-auth-v2.service.js";
import { bcryptPasswordHasher } from "../../src/modules/identity-access/application/password-hasher.js";
import { SequelizeBackofficeAuthV2Repository } from "../../src/modules/identity-access/persistence/backoffice-auth-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-backoffice-auth-admin@example.test",
    password: "test-only-backoffice-auth-seed-password",
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 backoffice authentication on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST,
            port: env.MYSQL_PORT,
            dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
            logging: false,
        });
        await sequelize.authenticate();
        await seedV2Database(sequelize, superAdmin);
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("authenticates the seeded SUPER_ADMIN from V2 roles and records a successful login", async () => {
        const username = `v2-root-${crypto.randomUUID().slice(0, 8)}`;
        await sequelize.query(
            "UPDATE accounts SET username = ?, updated_at = UTC_TIMESTAMP(3) WHERE email = ?",
            { replacements: [username, superAdmin.email], type: QueryTypes.UPDATE },
        );

        const persistence = createSalesV2Persistence(sequelize);
        const service = new BackofficeAuthV2Service({
            repository: new SequelizeBackofficeAuthV2Repository(persistence),
            accessContexts: new SequelizeV2AccessContextRepository(persistence),
            passwordHasher: bcryptPasswordHasher,
        });

        const login = await service.login({ username, password: superAdmin.password });
        expect(login).toMatchObject({
            kind: "authenticated",
            context: {
                accountId: expect.stringMatching(/^\d+$/),
                employeeId: null,
                grants: [expect.objectContaining({
                    roleCode: "SUPER_ADMIN",
                    scope: { type: "global" },
                })],
            },
        });

        const loginAudit = await sequelize.query<{ lastLoginAt: Date | null }>(
            "SELECT last_login_at AS lastLoginAt FROM accounts WHERE email = ?",
            { replacements: [superAdmin.email], type: QueryTypes.SELECT },
        );
        expect(loginAudit).toHaveLength(1);
        expect(loginAudit[0]!.lastLoginAt).not.toBeNull();
    });
});
