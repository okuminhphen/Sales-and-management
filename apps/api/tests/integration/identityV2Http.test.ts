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

    it("manages custom roles and permission mappings through global V2 grants", async () => {
        const admin = await request(app).post("/api/v1/admin/login")
            .send({ username: adminEmail, password: "http-test-admin-password-123" }).expect(200);
        const bearer = `Bearer ${admin.body.DT.token}`;
        await request(app).get("/api/v1/role/read").expect(401);
        const code = `HTTP_ROLE_${suffix.toUpperCase()}`;
        const created = await request(app).post("/api/v1/role/create").set("Authorization", bearer)
            .send({ code, name: "HTTP role", permissionCodes: ["audit.read.global"] }).expect(200);
        const id: number = created.body.DT.id;
        expect(created.body.DT).toMatchObject({ code, permissionCodes: ["audit.read.global"] });
        const listed = await request(app).get("/api/v1/role/read").set("Authorization", bearer).expect(200);
        expect(listed.body.DT).toEqual(expect.arrayContaining([expect.objectContaining({ id, code })]));
        const updated = await request(app).put(`/api/v1/role/update/${id}`).set("Authorization", bearer)
            .send({ permissionCodes: ["audit.read.global", "behavior.read.global"] }).expect(200);
        expect(updated.body.DT.permissionCodes).toEqual(["audit.read.global", "behavior.read.global"]);
        await request(app).put(`/api/v1/role/update/${id}`).set("Authorization", bearer)
            .send({ permissionCodes: ["missing.permission"] }).expect(404);
        await request(app).delete(`/api/v1/role/delete/${id}`).set("Authorization", bearer).expect(200);
    });

    it("creates and updates branches with BIGINT string IDs and global authorization", async () => {
        const admin = await request(app).post("/api/v1/admin/login")
            .send({ username: adminEmail, password: "http-test-admin-password-123" }).expect(200);
        const bearer = `Bearer ${admin.body.DT.token}`;
        await request(app).post("/api/v1/branch/create").send({
            code: `HTTP_${suffix.toUpperCase()}`, name: "Branch", address: "A",
        }).expect(401);
        const code = `HTTP_${suffix.toUpperCase()}`;
        const created = await request(app).post("/api/v1/branch/create").set("Authorization", bearer)
            .send({ code, name: "Branch", address: "A" }).expect(200);
        const id: string = created.body.DT.id;
        expect(id).toMatch(/^\d+$/);
        await request(app).post("/api/v1/branch/create").set("Authorization", bearer)
            .send({ code, name: "Duplicate", address: "A" }).expect(409);
        const updated = await request(app).put(`/api/v1/branch/update/${id}`).set("Authorization", bearer)
            .send({ name: "Updated branch" }).expect(200);
        expect(updated.body.DT).toMatchObject({ id, code, name: "Updated branch" });
        await request(app).get(`/api/v1/branch/${id}`).set("Authorization", bearer).expect(200);
        await request(app).get("/api/v1/branch/read?page=1&limit=10")
            .set("Authorization", bearer).expect(200);
        await request(app).put(`/api/v1/branch/update/${id}`).set("Authorization", bearer)
            .send({ code: "MUTABLE" }).expect(400);
    });

    it("creates, lists and deactivates employees within a branch without floating-point salary", async () => {
        const admin = await request(app).post("/api/v1/admin/login")
            .send({ username: adminEmail, password: "http-test-admin-password-123" }).expect(200);
        const bearer = `Bearer ${admin.body.DT.token}`;
        const branch = await request(app).post("/api/v1/branch/create").set("Authorization", bearer)
            .send({ code: `EMPBR_${suffix.toUpperCase()}`, name: "Employee branch", address: "B" }).expect(200);
        const branchId: string = branch.body.DT.id;
        const code = `HTTP_EMP_${suffix.toUpperCase()}`;
        await request(app).post("/api/v1/employee/create")
            .send({ branchId, code, fullName: "Employee" }).expect(401);
        const created = await request(app).post("/api/v1/employee/create").set("Authorization", bearer)
            .send({ branchId, code, fullName: "Employee", salary: "12345.6700" }).expect(200);
        const employeeId: string = created.body.DT.id;
        expect(created.body.DT).toMatchObject({ branchId, salary: "12345.6700", status: "active" });
        const managed = await request(app).put(`/api/v1/branch/${branchId}/manager`)
            .set("Authorization", bearer).send({ employeeId }).expect(200);
        expect(managed.body.DT.managerEmployeeId).toBe(employeeId);
        const listed = await request(app).get(`/api/v1/employee/read/${branchId}?page=1&limit=100`)
            .set("Authorization", bearer).expect(200);
        expect(listed.body.DT).toEqual(expect.arrayContaining([expect.objectContaining({ id: employeeId })]));
        await request(app).put(`/api/v1/employee/update/${employeeId}`).set("Authorization", bearer)
            .send({ fullName: "Renamed" }).expect(200);
        const deactivated = await request(app).delete(`/api/v1/employee/delete/${employeeId}`)
            .set("Authorization", bearer).expect(200);
        expect(deactivated.body.DT).toMatchObject({ id: employeeId, status: "inactive" });
        const branchAfter = await request(app).get(`/api/v1/branch/${branchId}`)
            .set("Authorization", bearer).expect(200);
        expect(branchAfter.body.DT.managerEmployeeId).toBeNull();
    });

    it("links an active account and transfers an employee without retaining old branch grants", async () => {
        const admin = await request(app).post("/api/v1/admin/login")
            .send({ username: adminEmail, password: "http-test-admin-password-123" }).expect(200);
        const bearer = `Bearer ${admin.body.DT.token}`;
        const first = await request(app).post("/api/v1/branch/create").set("Authorization", bearer)
            .send({ code: `FROM_${suffix.toUpperCase()}`, name: "From", address: "A" }).expect(200);
        const second = await request(app).post("/api/v1/branch/create").set("Authorization", bearer)
            .send({ code: `TO_${suffix.toUpperCase()}`, name: "To", address: "B" }).expect(200);
        const employee = await request(app).post("/api/v1/employee/create").set("Authorization", bearer)
            .send({ branchId: first.body.DT.id, code: `MOVE_${suffix.toUpperCase()}`,
                fullName: "Transfer candidate" }).expect(200);
        const accountEmail = `transfer-${suffix}@example.test`;
        await sequelize.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [accountEmail] });
        const account = await sequelize.query<{ id: string }>("SELECT id FROM accounts WHERE email = ?", {
            replacements: [accountEmail], type: QueryTypes.SELECT,
        });
        const accountId = account[0]!.id;
        const linked = await request(app).put(`/api/v1/employee/${employee.body.DT.id}/account`)
            .set("Authorization", bearer).send({ accountId }).expect(200);
        expect(linked.body.DT.accountId).toBe(accountId);
        await sequelize.query(`INSERT INTO account_roles
            (account_id, role_id, scope_type, scope_key, branch_id, assigned_at)
            SELECT ?, id, 'branch', ?, ?, UTC_TIMESTAMP(3) FROM roles WHERE code = 'BRANCH_MANAGER'`,
        { replacements: [accountId, `BRANCH:${first.body.DT.id}`, first.body.DT.id] });
        await request(app).put(`/api/v1/employee/${employee.body.DT.id}/account`)
            .set("Authorization", bearer).send({ accountId }).expect(200);
        const otherEmployee = await request(app).post("/api/v1/employee/create")
            .set("Authorization", bearer).send({ branchId: second.body.DT.id,
                code: `OTHER_${suffix.toUpperCase()}`, fullName: "Other candidate" }).expect(200);
        await request(app).put(`/api/v1/employee/${otherEmployee.body.DT.id}/account`)
            .set("Authorization", bearer).send({ accountId }).expect(409);
        const staleEmail = `stale-role-${suffix}@example.test`;
        await sequelize.query("INSERT INTO accounts (email, status, created_at, updated_at) VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [staleEmail] });
        const stale = await sequelize.query<{ id: string }>("SELECT id FROM accounts WHERE email = ?", {
            replacements: [staleEmail], type: QueryTypes.SELECT,
        });
        await sequelize.query(`INSERT INTO account_roles
            (account_id, role_id, scope_type, scope_key, branch_id, assigned_at)
            SELECT ?, id, 'global', 'GLOBAL', NULL, UTC_TIMESTAMP(3) FROM roles WHERE code = 'BRANCH_MANAGER'`,
        { replacements: [stale[0]!.id] });
        await request(app).put(`/api/v1/employee/${otherEmployee.body.DT.id}/account`)
            .set("Authorization", bearer).send({ accountId: stale[0]!.id }).expect(409);
        await request(app).put(`/api/v1/branch/${second.body.DT.id}/manager`)
            .set("Authorization", bearer).send({ employeeId: employee.body.DT.id }).expect(409);
        await request(app).put(`/api/v1/branch/${first.body.DT.id}/manager`).set("Authorization", bearer)
            .send({ employeeId: employee.body.DT.id }).expect(200);
        const transferred = await request(app).put(`/api/v1/employee/${employee.body.DT.id}/transfer`)
            .set("Authorization", bearer).send({ branchId: second.body.DT.id }).expect(200);
        expect(transferred.body.DT.branchId).toBe(second.body.DT.id);
        await request(app).put(`/api/v1/employee/${employee.body.DT.id}/transfer`)
            .set("Authorization", bearer).send({ branchId: second.body.DT.id }).expect(409);
        const oldBranch = await request(app).get(`/api/v1/branch/${first.body.DT.id}`)
            .set("Authorization", bearer).expect(200);
        expect(oldBranch.body.DT.managerEmployeeId).toBeNull();
        const grants = await sequelize.query<{ total: string }>(
            "SELECT COUNT(*) AS total FROM account_roles WHERE account_id = ? AND branch_id = ?",
            { replacements: [accountId, first.body.DT.id], type: QueryTypes.SELECT });
        expect(grants[0]!.total).toBe("0");
    });
});
