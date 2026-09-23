import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/observability/logger.js";
import {
    ResendEmailAdapter,
    TestEmailAdapter,
    sendEmailTemplate,
    setEmailSender,
} from "../../src/infrastructure/mail/index.js";
import { OtpService } from "../../src/modules/auth/otp/otp.service.js";
import { MemoryOtpStorage } from "../../src/modules/auth/otp/otp.repository.js";
import { env } from "../../src/config/env.js";

describe("Logger Sanitization & PII Protection (Required 4)", () => {
    let infoSpy: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
        infoSpy = vi.spyOn(logger, "info");
        warnSpy = vi.spyOn(logger, "warn");
        errorSpy = vi.spyOn(logger, "error");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        setEmailSender(undefined);
    });

    const getAllLoggedObjects = () => {
        const calls = [
            ...infoSpy.mock.calls,
            ...warnSpy.mock.calls,
            ...errorSpy.mock.calls,
        ];
        return calls.map((c: any[]) => JSON.stringify(c));
    };

    it("ensures ResendEmailAdapter never logs raw recipient emails or secrets", async () => {
        const rawEmail = "sensitive-customer@happyshop.vn";
        const secretKey = env.RESEND_API_KEY || "re_test_key_secret_12345";

        const mockSend = vi.fn().mockResolvedValue({
            data: { id: "msg_clean_123" },
            error: null,
        });

        const adapter = new ResendEmailAdapter({
            apiKey: secretKey,
            defaultFrom: "HappyShop <no-reply@happyshop.vn>",
            client: { emails: { send: mockSend } as any },
        });

        await adapter.send({
            to: rawEmail,
            subject: "Mã bảo mật",
            html: "<p>123456</p>",
        });

        const allLogs = getAllLoggedObjects();
        expect(allLogs.length).toBeGreaterThan(0);

        for (const logLine of allLogs) {
            expect(logLine).not.toContain(rawEmail);
            expect(logLine).not.toContain(secretKey);
            expect(logLine).not.toContain("123456");
        }
    });

    it("ensures sendEmailTemplate facade never logs raw recipient emails", async () => {
        const rawEmail = "order-buyer@domain.com";
        const testSender = new TestEmailAdapter();
        setEmailSender(testSender);

        await sendEmailTemplate(
            rawEmail,
            "Xác nhận đơn hàng",
            "newCus",
            {
                fullname: "Nguyễn Văn Test",
                email: rawEmail,
                username: "ordertest",
            },
            "user"
        );

        const allLogs = getAllLoggedObjects();
        expect(allLogs.length).toBeGreaterThan(0);

        for (const logLine of allLogs) {
            expect(logLine).not.toContain(rawEmail);
            expect(logLine).not.toContain(env.OTP_HMAC_SECRET);
        }
    });

    it("ensures OtpService never logs raw OTP codes or raw recipient emails", async () => {
        const rawEmail = "otp-victim@secure.org";
        const memoryStorage = new MemoryOtpStorage();
        const testSender = new TestEmailAdapter();
        const service = new OtpService(
            () => memoryStorage,
            () => testSender
        );

        // 1. Create challenge
        const createRes = await service.createVerificationChallenge(rawEmail);
        expect(createRes.success).toBe(true);
        if (!createRes.success) return;

        // Extract raw OTP from test email
        const sentEmail = testSender.getLastEmail();
        const match = sentEmail?.html.match(/>(\d{6})</);
        expect(match).not.toBeNull();
        const rawOtp = match![1];

        // 2. Wrong OTP attempt
        await service.verifyChallenge(createRes.data.challengeId, "999999");

        // 3. Exhaust attempts to trigger warning
        for (let i = 0; i < 4; i++) {
            await service.verifyChallenge(createRes.data.challengeId, "999999");
        }

        const allLogs = getAllLoggedObjects();
        expect(allLogs.length).toBeGreaterThan(0);

        for (const logLine of allLogs) {
            expect(logLine).not.toContain(rawEmail);
            expect(logLine).not.toContain(rawOtp);
            expect(logLine).not.toContain(env.OTP_HMAC_SECRET);
        }
    });
});

describe("Logger JSON Output PII Scrubbing (P1 - console output verification)", () => {
    let consoleLogSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const getAllConsoleOutput = (): string[] => {
        const logCalls = consoleLogSpy.mock.calls.map((c: any[]) => String(c[0]));
        const errCalls = consoleErrorSpy.mock.calls.map((c: any[]) => String(c[0]));
        return [...logCalls, ...errCalls];
    };

    it("scrubs email addresses from exception messages logged via logger.error", () => {
        const piiEmail = "leaked-user@example.com";
        const fakeApiKey = "re_secret_api_key_1234567890";
        const errorWithPII = new Error(
            `Failed to deliver to ${piiEmail} using key ${fakeApiKey}`
        );
        errorWithPII.name = "ResendAPIError";

        logger.error("provider.error", {
            errorMessage: errorWithPII.message,
            errorName: errorWithPII.name,
            nested: {
                detail: `Rejected: ${piiEmail}`,
                key: fakeApiKey,
            },
        });

        const output = getAllConsoleOutput();
        expect(output.length).toBeGreaterThan(0);

        for (const line of output) {
            expect(line).not.toContain(piiEmail);
            expect(line).not.toContain(fakeApiKey);
            expect(line).toContain("[EMAIL_REDACTED]");
            expect(line).toContain("[APIKEY_REDACTED]");
        }
    });

    it("scrubs email from Error objects logged as context values", () => {
        const piiEmail = "victim@company.org";
        const errorObj = new Error(`SMTP rejected recipient ${piiEmail}`);

        logger.error("smtp.failure", {
            error: errorObj,
        });

        const output = getAllConsoleOutput();
        expect(output.length).toBeGreaterThan(0);

        for (const line of output) {
            expect(line).not.toContain(piiEmail);
        }
    });

    it("does not produce false positives for non-PII strings", () => {
        const emailHash = "5a9c8f123456de7890abc1234567890def1234567890abcdef1234567890abcd";
        logger.info("normal.event", {
            challengeId: "abc-123-def",
            emailHash,
            count: 42,
            status: "success",
        });

        const output = getAllConsoleOutput();
        expect(output.length).toBeGreaterThan(0);

        for (const line of output) {
            expect(line).not.toContain("[EMAIL_REDACTED]");
            expect(line).not.toContain("[APIKEY_REDACTED]");
            expect(line).toContain("abc-123-def");
            expect(line).toContain(emailHash);
        }
    });

    it("redacts password and token keys regardless of value content", () => {
        logger.info("auth.attempt", {
            password: "mysecretpassword",
            token: "jwt.token.value",
            username: "testuser",
        });

        const output = getAllConsoleOutput();
        expect(output.length).toBeGreaterThan(0);

        for (const line of output) {
            expect(line).not.toContain("mysecretpassword");
            expect(line).not.toContain("jwt.token.value");
            expect(line).toContain("[REDACTED]");
            expect(line).toContain("testuser");
        }
    });

    it.each([
        "OTP: 123456",
        "123456",
        "Provider rejected OTP 123456 during verification",
    ])("redacts OTP at every string boundary from context: %s", (unsafeMessage) => {
        logger.error("otp.provider_failed", { detail: unsafeMessage });

        const output = getAllConsoleOutput();
        expect(output).toHaveLength(1);
        expect(output[0]).not.toContain("123456");
        expect(output[0]).toContain("[OTP_REDACTED]");
    });

    it("scrubs sensitive values embedded in the event message", () => {
        logger.error("OTP: 123456 for leaked-user@example.com");

        const output = getAllConsoleOutput();
        expect(output).toHaveLength(1);
        expect(output[0]).not.toContain("123456");
        expect(output[0]).not.toContain("leaked-user@example.com");
        expect(output[0]).toContain("[OTP_REDACTED]");
        expect(output[0]).toContain("[EMAIL_REDACTED]");
    });
});
