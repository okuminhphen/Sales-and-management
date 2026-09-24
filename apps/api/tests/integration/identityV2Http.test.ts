import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { createIdentityV2Router } from "../../src/routes/identity-v2.js";
import { verifyV2AccessToken } from "../../src/security/v2-access-token.js";
import type { VerificationTokenGateway } from "../../src/modules/identity-access/application/customer-auth-v2.service.js";
import { MemoryOtpStorage, setOtpStorage } from "../../src/modules/auth/otp/otp.repository.js";
import { setEmailSender, TestEmailAdapter } from "../../src/infrastructure/mail/index.js";
import { setOtpRecaptchaEnabledOverride } from "../../src/modules/auth/otp/recaptcha.guard.js";

const run = process.env.RUN_DATABASE_V2_TESTS === "true";
const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const gateway: VerificationTokenGateway = {
    claim: async (_token, email) => email.includes("wrong")
        ? { success: false, error: "EMAIL_MISMATCH" } : { success: true },
    release: async () => true,
    finalize: async () => true,
};

describe.skipIf(!run)("Identity V2 HTTP on MySQL", () => {
    let sequelize: Sequelize;
    let app: express.Express;
    let adminId: string;
    const email = `http-customer-${suffix}@example.test`;
    const password = "http-test-customer-password-123";
    const adminEmail = `http-admin-${suffix}@example.test`;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test database required");
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
        });
        await sequelize.authenticate();
        await seedV2Database(sequelize, { email: adminEmail, password: "http-test-admin-password-123" });
        const admin = await sequelize.query<{ id: string }>("SELECT id FROM accounts WHERE email = ?", {
            replacements: [adminEmail], type: QueryTypes.SELECT,
        });
        adminId = admin[0]!.id;
        app = express();
        app.use(express.json());
        app.use("/api/v1", createIdentityV2Router({ persistence: createSalesV2Persistence(sequelize),
            verificationGateway: gateway, loginRateLimit: (_req, _res, next) => next() }));
    });
    afterAll(async () => {
        setOtpStorage(undefined);
        setEmailSender(undefined);
        setOtpRecaptchaEnabledOverride(undefined);
        await sequelize?.close();
    });

    it("connects the real OTP challenge and verification-token lifecycle to V2 registration", async () => {
        const storage = new MemoryOtpStorage();
        const sender = new TestEmailAdapter();
        setOtpStorage(storage);
        setEmailSender(sender);
        setOtpRecaptchaEnabledOverride(false);
        const otpApp = express();
        otpApp.use(express.json());
        otpApp.use("/api/v1", createIdentityV2Router({ persistence: createSalesV2Persistence(sequelize),
            loginRateLimit: (_req, _res, next) => next() }));
        const address = `otp-http-${suffix}@example.test`;
        const challenge = await request(otpApp).post("/api/v1/auth/email-verification/challenges")
            .send({ email: address }).expect(202);
        const otp = />(\d{6})</.exec(sender.getLastEmail()?.html ?? "")?.[1];
        if (!otp) throw new Error("Fake email contained no OTP");
        const verified = await request(otpApp)
            .post(`/api/v1/auth/email-verification/challenges/${challenge.body.DT.challengeId}/verify`)
            .send({ otp }).expect(200);
        const body = { email: address, username: `otp_${suffix}`, phone: "0900000001",
            password: "http-test-otp-password-123", emailVerificationToken: verified.body.DT.verificationToken };
        await request(otpApp).post("/api/v1/register").send(body).expect(200);
        await request(otpApp).post("/api/v1/register").send(body).expect(400);
    });

    it("registers with verified token, prevents duplicate email and issues a V2 customer JWT", async () => {
        await request(app).post("/api/v1/register").send({ email: `wrong-${suffix}@example.test`,
            phone: "0900000000", username: `wrong-${suffix}`, password,
            emailVerificationToken: crypto.randomUUID() }).expect(400);
        const body = { email, phone: "0900000000", username: `customer_${suffix}`, password,
            emailVerificationToken: crypto.randomUUID() };
        const registered = await request(app).post("/api/v1/register").send(body).expect(200);
        expect(registered.body).toMatchObject({ EC: 0, DT: { accountId: expect.any(String), customerId: expect.any(String) } });
        await request(app).post("/api/v1/register").send(body).expect(409);
        await request(app).post("/api/v1/register").send({ ...body,
            email: `other-${suffix}@example.test`, emailVerificationToken: crypto.randomUUID() }).expect(409);
        await request(app).post("/api/v1/login").send({ emailOrPhone: email, password: "wrong-password" }).expect(401);
        const login = await request(app).post("/api/v1/login").send({ emailOrPhone: email, password }).expect(200);
        expect(verifyV2AccessToken(login.body.DT.token)).toMatchObject({
            accountId: registered.body.DT.accountId, customerId: registered.body.DT.customerId,
        });
        expect(login.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining("HttpOnly")]));
        const own = await request(app).get("/api/v1/user/" + registered.body.DT.customerId)
            .set("Authorization", `Bearer ${login.body.DT.token}`).expect(200);
        expect(own.body.DT).toMatchObject({ email, userId: registered.body.DT.customerId });
        const changed = await request(app).put("/api/v1/user/update/" + registered.body.DT.customerId)
            .set("Authorization", `Bearer ${login.body.DT.token}`)
            .send({ fullname: "Updated Customer", phone: "0912345678" }).expect(200);
        expect(changed.body.DT).toMatchObject({ fullname: "Updated Customer", phone: "0912345678" });
        await request(app).put("/api/v1/user/update/" + registered.body.DT.customerId)
            .set("Authorization", `Bearer ${login.body.DT.token}`)
            .send({ email: "unverified@example.test" }).expect(400);
        await request(app).get("/api/v1/user/999999999999999")
            .set("Authorization", `Bearer ${login.body.DT.token}`).expect(403);
        await sequelize.query("UPDATE customers SET status = 'inactive' WHERE id = ?", {
            replacements: [registered.body.DT.customerId],
        });
        await request(app).get("/api/v1/user/" + registered.body.DT.customerId)
            .set("Authorization", `Bearer ${login.body.DT.token}`).expect(401);
    });

    it("authenticates backoffice from the current DB grants and rejects customers", async () => {
        const login = await request(app).post("/api/v1/admin/login")
            .send({ username: adminEmail, password: "http-test-admin-password-123" }).expect(200);
        expect(verifyV2AccessToken(login.body.DT.token).accountId).toBe(adminId);
        expect(login.body.DT.role).toBe("SUPER_ADMIN");
        await request(app).post("/api/v1/admin/login")
            .send({ username: `customer_${suffix}`, password }).expect(401);
    });
});
