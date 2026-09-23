import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { setEmailSender, TestEmailAdapter } from "../../src/infrastructure/mail/index.js";
import { setRecaptchaVerifier } from "../../src/infrastructure/recaptcha/index.js";
import {
    MemoryOtpStorage,
    setOtpStorage,
} from "../../src/modules/auth/otp/otp.repository.js";
import { setOtpRecaptchaEnabledOverride } from "../../src/modules/auth/otp/recaptcha.guard.js";

describe("OTP Email Verification API", () => {
    let app: ReturnType<typeof createApp>;
    let testStorage: MemoryOtpStorage;
    let testSender: TestEmailAdapter;

    beforeEach(() => {
        testStorage = new MemoryOtpStorage();
        testSender = new TestEmailAdapter();
        setOtpStorage(testStorage);
        setEmailSender(testSender);
        setOtpRecaptchaEnabledOverride(false);
        app = createApp();
    });

    afterEach(() => {
        setOtpStorage(undefined);
        setEmailSender(undefined);
        setRecaptchaVerifier(undefined);
        setOtpRecaptchaEnabledOverride(undefined);
    });

    describe("POST /api/v1/auth/email-verification/challenges", () => {
        it("rejects invalid email addresses", async () => {
            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "invalid-email" });

            expect(response.status).toBe(400);
            expect(response.body.EC).toBe(1);
            expect(response.body.EM).toBe("Request validation failed");
        });

        it("creates challenge and sends email on valid request", async () => {
            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "newuser@example.com" });

            expect(response.status).toBe(202);
            expect(response.body.EC).toBe(0);
            expect(response.body.DT).toHaveProperty("challengeId");
            expect(response.body.DT.expiresInSeconds).toBe(300);
            expect(response.body.DT.resendAfterSeconds).toBe(60);

            expect(testSender.sentEmails).toHaveLength(1);
            expect(testSender.sentEmails[0].to).toBe("newuser@example.com");
        });

        it("rejects a direct challenge request without captcha when server-side captcha is enabled", async () => {
            const verifier = { verify: vi.fn() };
            setOtpRecaptchaEnabledOverride(true);
            setRecaptchaVerifier(verifier);

            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "bot@example.com" });

            expect(response.status).toBe(400);
            expect(response.body.EC).toBe(1);
            expect(verifier.verify).not.toHaveBeenCalled();
            expect(testSender.sentEmails).toHaveLength(0);
        });

        it.each([
            ["invalid token", { valid: false, reason: "INVALID_TOKEN" }],
            ["wrong action", { valid: false, reason: "ACTION_MISMATCH" }],
            ["low score", { valid: false, reason: "SCORE_TOO_LOW" }],
        ])("rejects captcha verification failure: %s", async (_caseName, verificationResult) => {
            const verifier = { verify: vi.fn().mockResolvedValue(verificationResult) };
            setOtpRecaptchaEnabledOverride(true);
            setRecaptchaVerifier(verifier);

            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "bot@example.com", recaptchaToken: "untrusted-token" });

            expect(response.status).toBe(403);
            expect(response.body.EC).toBe(1);
            expect(testSender.sentEmails).toHaveLength(0);
        });

        it("creates a challenge only after server-side captcha verification succeeds", async () => {
            const verifier = { verify: vi.fn().mockResolvedValue({ valid: true }) };
            setOtpRecaptchaEnabledOverride(true);
            setRecaptchaVerifier(verifier);

            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "human@example.com", recaptchaToken: "valid-token" });

            expect(response.status).toBe(202);
            expect(verifier.verify).toHaveBeenCalledWith({
                token: "valid-token",
                expectedAction: "register",
                remoteIp: expect.any(String),
            });
            expect(testSender.sentEmails).toHaveLength(1);
        });

        it("fails closed when the captcha provider is unavailable", async () => {
            const verifier = { verify: vi.fn().mockRejectedValue(new Error("provider timeout")) };
            setOtpRecaptchaEnabledOverride(true);
            setRecaptchaVerifier(verifier);

            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "human@example.com", recaptchaToken: "provider-timeout-token" });

            expect(response.status).toBe(503);
            expect(response.body.EC).toBe(-1);
            expect(testSender.sentEmails).toHaveLength(0);
        });

        it("enforces cooldown on rapid repeat requests", async () => {
            await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "cooldown@example.com" });

            const repeat = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "cooldown@example.com" });

            expect(repeat.status).toBe(429);
            expect(repeat.body.EC).toBe(1);
            expect(repeat.body.DT.retryAfterSeconds).toBeGreaterThan(0);
        });
    });

    describe("POST /api/v1/auth/email-verification/challenges/:challengeId/verify", () => {
        it("rejects non-uuid challengeId", async () => {
            const response = await request(app)
                .post("/api/v1/auth/email-verification/challenges/invalid-uuid/verify")
                .send({ otp: "123456" });

            expect(response.status).toBe(400);
            expect(response.body.EC).toBe(1);
            expect(response.body.EM).toBe("Request validation failed");
        });

        it("rejects invalid otp format", async () => {
            const response = await request(app)
                .post(
                    "/api/v1/auth/email-verification/challenges/00000000-0000-0000-0000-000000000000/verify"
                )
                .send({ otp: "abc" });

            expect(response.status).toBe(400);
            expect(response.body.EC).toBe(1);
            expect(response.body.EM).toBe("Request validation failed");
        });

        it("returns error on wrong OTP with remaining attempts", async () => {
            const challengeRes = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "verifytest@example.com" });

            const challengeId = challengeRes.body.DT.challengeId;

            const verifyRes = await request(app)
                .post(`/api/v1/auth/email-verification/challenges/${challengeId}/verify`)
                .send({ otp: "000000" });

            expect(verifyRes.status).toBe(400);
            expect(verifyRes.body.EC).toBe(1);
            expect(verifyRes.body.DT.attemptsRemaining).toBe(4);
        });

        it("successfully verifies correct OTP and returns verification token", async () => {
            const challengeRes = await request(app)
                .post("/api/v1/auth/email-verification/challenges")
                .send({ email: "success@example.com" });

            const challengeId = challengeRes.body.DT.challengeId;

            // Extract OTP from test email
            const sentHtml = testSender.sentEmails[0].html;
            const match = sentHtml.match(/>(\d{6})</);
            expect(match).not.toBeNull();
            const otpCode = match![1];

            const verifyRes = await request(app)
                .post(`/api/v1/auth/email-verification/challenges/${challengeId}/verify`)
                .send({ otp: otpCode });

            expect(verifyRes.status).toBe(200);
            expect(verifyRes.body.EC).toBe(0);
            expect(verifyRes.body.DT).toHaveProperty("verificationToken");
            expect(verifyRes.body.DT.expiresInSeconds).toBe(600);
        });
    });
});
