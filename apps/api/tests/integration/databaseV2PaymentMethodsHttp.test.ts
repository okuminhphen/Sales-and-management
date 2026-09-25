import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { signV2AccessToken } from "../../src/security/v2-access-token.js";
import { createV2AuthMiddleware } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";
import { PaymentMethodV2Service } from "../../src/modules/payment/application/payment-method-v2.service.js";
import { SequelizePaymentMethodV2Repository } from "../../src/modules/payment/persistence/payment-method-v2.repository.js";
import { createPaymentMethodV2Router } from "../../src/modules/payment/interfaces/http/payment-method-v2.routes.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 payment method HTTP on MySQL", () => {
    let sequelize: Sequelize;
    let app: express.Express;
    let token: string;
    let accountId: string;
    let activeCode: string;
    let inactiveCode: string;
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required.");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await sequelize.authenticate();
        const email = `payment-method-${suffix}@example.test`;
        await seedV2Database(sequelize, { email, password: "test-only-payment-method-password" });
        const rows = await sequelize.query<{ id: string }>("SELECT id FROM accounts WHERE email = ?", {
            replacements: [email], type: QueryTypes.SELECT,
        });
        accountId = rows[0]!.id;
        token = signV2AccessToken({ version: 2, accountId, customerId: null, employeeId: null,
            roleGrants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" } }] });
        activeCode = `TEST_ACTIVE_${suffix}`;
        inactiveCode = `TEST_INACTIVE_${suffix}`;
        await sequelize.query(`INSERT INTO payment_methods (code, name, description, is_active, created_at, updated_at)
            VALUES (?, 'Test active', 'Available', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
                   (?, 'Test inactive', 'Unavailable', FALSE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, {
            replacements: [activeCode, inactiveCode],
        });
        const persistence = createSalesV2Persistence(sequelize);
        const auth = createV2AuthMiddleware({ accessContexts: new SequelizeV2AccessContextRepository(persistence) });
        const methods = new PaymentMethodV2Service({ repository: new SequelizePaymentMethodV2Repository(persistence) });
        app = express();
        app.use("/api/v1", createPaymentMethodV2Router({ auth, methods }));
    });

    afterAll(async () => { await sequelize?.close(); });

    it("returns only active V2 methods in the legacy envelope with string IDs", async () => {
        const response = await request(app).get("/api/v1/payment-methods")
            .set("Authorization", `Bearer ${token}`).expect(200);
        expect(response.body).toMatchObject({ EM: "Get payment methods successfully", EC: "0" });
        const methods = response.body.DT as { id: unknown; code: string; name: string; description: string }[];
        expect(methods.find((method) => method.code === activeCode)).toMatchObject({
            id: expect.any(String), name: "Test active", description: "Available",
        });
        expect(methods.some((method) => method.code === inactiveCode)).toBe(false);
    });

    it("requires a live account-backed access token", async () => {
        await request(app).get("/api/v1/payment-methods").expect(401);
        await sequelize.query("UPDATE accounts SET status = 'inactive' WHERE id = ?", { replacements: [accountId] });
        await request(app).get("/api/v1/payment-methods")
            .set("Authorization", `Bearer ${token}`).expect(401);
    });
});
