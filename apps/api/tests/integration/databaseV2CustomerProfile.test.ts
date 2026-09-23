import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import {
    CustomerAuthV2Service,
    bcryptPasswordHasher,
    type VerificationTokenGateway,
} from "../../src/modules/identity-access/application/customer-auth-v2.service.js";
import { CustomerProfileV2Service } from "../../src/modules/identity-access/application/customer-profile-v2.service.js";
import { SequelizeCustomerAuthV2Repository } from "../../src/modules/identity-access/persistence/customer-auth-v2.repository.js";
import { SequelizeCustomerProfileV2Repository } from "../../src/modules/identity-access/persistence/customer-profile-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-customer-profile-admin@example.test",
    password: "test-only-customer-profile-seed-password",
};

const verificationGateway: VerificationTokenGateway = {
    claim: async () => ({ success: true }),
    release: async () => true,
    finalize: async () => true,
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 customer profile on MySQL", () => {
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

    it("updates the active customer's account and customer profile without changing verified email", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const customerAuth = new CustomerAuthV2Service({
            repository: new SequelizeCustomerAuthV2Repository(persistence),
            verificationGateway,
            passwordHasher: bcryptPasswordHasher,
        });
        const unique = crypto.randomUUID();
        const email = `customer-profile-${unique}@example.test`;
        const registration = await customerAuth.register({
            email,
            phone: `07${unique.replace(/\D/g, "").slice(0, 8)}`,
            username: `profile-${unique.slice(0, 8)}`,
            password: "customer-profile-password-123",
            emailVerificationToken: crypto.randomUUID(),
        });
        expect(registration.kind).toBe("registered");
        if (registration.kind !== "registered") return;

        const accessContexts = new SequelizeV2AccessContextRepository(persistence);
        const context = await accessContexts.findActiveByAccountId(registration.accountId);
        expect(context).not.toBeNull();
        if (!context) return;

        const profiles = new CustomerProfileV2Service({
            repository: new SequelizeCustomerProfileV2Repository(persistence),
        });
        const updatedUsername = `updated-${unique.slice(0, 8)}`;
        const update = await profiles.updateOwnProfile(context, {
            username: updatedUsername,
            fullName: "Nguyễn Văn Profile",
            phone: "0912345678",
        });

        expect(update).toEqual({
            kind: "updated",
            profile: {
                accountId: registration.accountId,
                customerId: registration.customerId,
                email,
                username: updatedUsername,
                fullName: "Nguyễn Văn Profile",
                phone: "0912345678",
            },
        });
        await expect(profiles.getOwnProfile(context)).resolves.toEqual({
            kind: "found",
            profile: expect.objectContaining({
                accountId: registration.accountId,
                customerId: registration.customerId,
                email,
                username: updatedUsername,
            }),
        });
    });

    it("maps the database username uniqueness constraint to a safe business result", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const customerAuth = new CustomerAuthV2Service({
            repository: new SequelizeCustomerAuthV2Repository(persistence),
            verificationGateway,
            passwordHasher: bcryptPasswordHasher,
        });
        const unique = crypto.randomUUID();
        const firstUsername = `first-${unique.slice(0, 8)}`;
        const createCustomer = (suffix: string, username: string) => customerAuth.register({
            email: `customer-profile-unique-${suffix}-${unique}@example.test`,
            phone: `06${unique.replace(/\D/g, "").slice(0, 7)}${suffix}`,
            username,
            password: "customer-profile-password-123",
            emailVerificationToken: crypto.randomUUID(),
        });
        const first = await createCustomer("1", firstUsername);
        const second = await createCustomer("2", `second-${unique.slice(0, 8)}`);
        expect(first.kind).toBe("registered");
        expect(second.kind).toBe("registered");
        if (first.kind !== "registered" || second.kind !== "registered") return;

        const context = await new SequelizeV2AccessContextRepository(persistence)
            .findActiveByAccountId(second.accountId);
        expect(context).not.toBeNull();
        if (!context) return;

        const profiles = new CustomerProfileV2Service({
            repository: new SequelizeCustomerProfileV2Repository(persistence),
        });
        await expect(profiles.updateOwnProfile(context, { username: firstUsername }))
            .resolves.toEqual({ kind: "username_already_exists" });
    });
});
