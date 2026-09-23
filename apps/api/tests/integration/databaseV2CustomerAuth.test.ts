import crypto from "node:crypto";
import bcrypt from "bcryptjs";
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
import { SequelizeCustomerAuthV2Repository } from "../../src/modules/identity-access/persistence/customer-auth-v2.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-customer-auth-admin@example.test",
    password: "test-only-customer-auth-seed-password",
};

const verificationGateway: VerificationTokenGateway = {
    claim: async () => ({ success: true }),
    release: async () => true,
    finalize: async () => true,
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 customer authentication on MySQL", () => {
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
            dialectOptions: {
                supportBigNumbers: true,
                bigNumberStrings: true,
            },
            logging: false,
        });
        await sequelize.authenticate();
        await seedV2Database(sequelize, superAdmin);
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("creates Account, Customer and global CUSTOMER assignment atomically, then authenticates by email or phone", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const service = new CustomerAuthV2Service({
            repository: new SequelizeCustomerAuthV2Repository(persistence),
            verificationGateway,
            passwordHasher: bcryptPasswordHasher,
        });
        const unique = crypto.randomUUID();
        const email = `v2-customer-${unique}@example.test`;
        const phone = `09${unique.replace(/\D/g, "").slice(0, 8)}`;

        const registration = await service.register({
            email,
            phone,
            username: `customer-${unique.slice(0, 8)}`,
            password: "customer-password-123",
            emailVerificationToken: crypto.randomUUID(),
        });

        expect(registration.kind).toBe("registered");
        if (registration.kind !== "registered") return;
        expect(registration.accountId).toMatch(/^\d+$/);
        expect(registration.customerId).toMatch(/^\d+$/);

        const account = await persistence.models.get("Account").findByPk(registration.accountId);
        const customer = await persistence.models.get("Customer").findByPk(registration.customerId);
        const assignments = await sequelize.query<{ total: string }>(
            "SELECT COUNT(*) AS total FROM account_roles ar INNER JOIN roles r ON r.id = ar.role_id WHERE ar.account_id = ? AND r.code = 'CUSTOMER' AND ar.scope_type = 'global' AND ar.scope_key = 'GLOBAL'",
            { replacements: [registration.accountId], type: QueryTypes.SELECT },
        );

        expect(account?.get("email")).toBe(email);
        await expect(bcrypt.compare("customer-password-123", String(account?.get("passwordHash")))).resolves.toBe(true);
        expect(customer?.get("accountId")).toBe(registration.accountId);
        expect(customer?.get("phone")).toBe(phone);
        expect(assignments).toHaveLength(1);
        expect(assignments[0]!.total).toBe("1");

        await expect(service.login({ emailOrPhone: email.toUpperCase(), password: "customer-password-123" }))
            .resolves.toMatchObject({
                kind: "authenticated",
                accountId: registration.accountId,
                customerId: registration.customerId,
                email,
                role: { code: "CUSTOMER" },
            });
        await expect(service.login({ emailOrPhone: phone, password: "customer-password-123" }))
            .resolves.toMatchObject({ kind: "authenticated", accountId: registration.accountId });

        const secondRegistration = await service.register({
            email: `v2-second-${unique}@example.test`,
            phone,
            username: `second-${unique.slice(0, 8)}`,
            password: "second-customer-password-123",
            emailVerificationToken: crypto.randomUUID(),
        });
        expect(secondRegistration.kind).toBe("registered");
        await expect(service.login({ emailOrPhone: phone, password: "customer-password-123" }))
            .resolves.toEqual({ kind: "invalid_credentials" });
    });

    it("retries transient transaction conflicts when multiple customers register concurrently", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const service = new CustomerAuthV2Service({
            repository: new SequelizeCustomerAuthV2Repository(persistence),
            verificationGateway,
            passwordHasher: bcryptPasswordHasher,
        });
        const unique = crypto.randomUUID();
        const registrations = await Promise.all(["1", "2"].map((suffix) => service.register({
            email: `v2-concurrent-customer-${suffix}-${unique}@example.test`,
            phone: `06${unique.replace(/\D/g, "").slice(0, 7)}${suffix}`,
            username: `concurrent-${suffix}-${unique.slice(0, 8)}`,
            password: "customer-password-123",
            emailVerificationToken: crypto.randomUUID(),
        })));

        expect(registrations).toHaveLength(2);
        for (const registration of registrations) {
            expect(registration).toMatchObject({
                kind: "registered",
                accountId: expect.stringMatching(/^\d+$/),
                customerId: expect.stringMatching(/^\d+$/),
            });
        }
    });
});
