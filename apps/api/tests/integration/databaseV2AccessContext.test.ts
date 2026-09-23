import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import {
    CustomerAuthV2Service,
    bcryptPasswordHasher,
    type VerificationTokenGateway,
} from "../../src/modules/identity-access/application/customer-auth-v2.service.js";
import { canAccessBranch } from "../../src/modules/identity-access/application/access-context.js";
import { SequelizeCustomerAuthV2Repository } from "../../src/modules/identity-access/persistence/customer-auth-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-access-context-admin@example.test",
    password: "test-only-access-context-seed-password",
};

const verificationGateway: VerificationTokenGateway = {
    claim: async () => ({ success: true }),
    release: async () => true,
    finalize: async () => true,
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 access context on MySQL", () => {
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

    it("derives active customer and SUPER_ADMIN grants from V2 tables rather than trusting token roles", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const customerAuth = new CustomerAuthV2Service({
            repository: new SequelizeCustomerAuthV2Repository(persistence),
            verificationGateway,
            passwordHasher: bcryptPasswordHasher,
        });
        const unique = crypto.randomUUID();
        const registration = await customerAuth.register({
            email: `access-context-${unique}@example.test`,
            phone: `08${unique.replace(/\D/g, "").slice(0, 8)}`,
            username: `access-${unique.slice(0, 8)}`,
            password: "customer-password-123",
            emailVerificationToken: crypto.randomUUID(),
        });
        expect(registration.kind).toBe("registered");
        if (registration.kind !== "registered") return;

        const contexts = new SequelizeV2AccessContextRepository(persistence);
        const customerContext = await contexts.findActiveByAccountId(registration.accountId);
        const superAdminRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM accounts WHERE email = ?",
            { replacements: [superAdmin.email], type: QueryTypes.SELECT },
        );
        const superAdminContext = await contexts.findActiveByAccountId(superAdminRows[0]!.id);

        expect(customerContext).toMatchObject({
            accountId: registration.accountId,
            customerId: registration.customerId,
            employeeId: null,
            grants: [{
                roleCode: "CUSTOMER",
                scope: { type: "global" },
                permissions: [],
            }],
        });
        expect(canAccessBranch(customerContext!, "9007199254740995", "order.read.branch")).toBe(false);
        expect(superAdminContext?.grants).toContainEqual(expect.objectContaining({
            roleCode: "SUPER_ADMIN",
            scope: { type: "global" },
        }));
        expect(canAccessBranch(superAdminContext!, "9007199254740995", "order.manage.global")).toBe(true);
    });
});
