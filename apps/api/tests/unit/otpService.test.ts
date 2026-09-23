import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryOtpStorage } from "../../src/modules/auth/otp/otp.repository.js";
import { OtpService } from "../../src/modules/auth/otp/otp.service.js";
import { TestEmailAdapter } from "../../src/infrastructure/mail/test-email.adapter.js";

describe("OtpService", () => {
    let memoryStorage: MemoryOtpStorage;
    let testEmailSender: TestEmailAdapter;
    let service: OtpService;

    beforeEach(() => {
        memoryStorage = new MemoryOtpStorage();
        testEmailSender = new TestEmailAdapter();
        service = new OtpService(
            () => memoryStorage,
            () => testEmailSender
        );
    });

    it("creates challenge and sends OTP email", async () => {
        const result = await service.createVerificationChallenge("User@Example.com");

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.challengeId).toBeDefined();
        expect(result.data.expiresInSeconds).toBe(300);
        expect(result.data.resendAfterSeconds).toBe(60);

        expect(testEmailSender.sentEmails).toHaveLength(1);
        const sent = testEmailSender.sentEmails[0];
        expect(sent.to).toBe("user@example.com");
        expect(sent.subject).toContain("Mã xác thực");
        expect(sent.html).toMatch(/\d{6}/); // Contains 6-digit code

        // Verify storage contains hashed code, not raw code
        const challengeInDb = await memoryStorage.getChallenge(result.data.challengeId);
        expect(challengeInDb).toBeDefined();
        expect(challengeInDb?.email).toBe("user@example.com");
        expect(challengeInDb?.codeHash).toBeDefined();
        expect(challengeInDb?.codeHash.length).toBe(64); // SHA-256 HMAC
    });

    it("blocks rapid resend during cooldown period", async () => {
        const first = await service.createVerificationChallenge("test@example.com");
        expect(first.success).toBe(true);

        const second = await service.createVerificationChallenge("test@example.com");
        expect(second.success).toBe(false);
        if (!second.success) {
            expect(second.error).toBe("COOLDOWN_ACTIVE");
            expect(second.retryAfterSeconds).toBeGreaterThan(0);
        }
        expect(testEmailSender.sentEmails).toHaveLength(1);
    });

    it("rolls back challenge if email sending fails", async () => {
        const failingSender = {
            send: vi.fn().mockRejectedValue(new Error("Network failure")),
        };
        const failingService = new OtpService(
            () => memoryStorage,
            () => failingSender as any
        );

        const result = await failingService.createVerificationChallenge("fail@example.com");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe("PROVIDER_ERROR");
        }
        // Verify challenge was cleaned up
        const active = await memoryStorage.getActiveChallengeId("fail@example.com");
        expect(active).toBeNull();
    });

    it("verifies challenge successfully and generates one-time verification token", async () => {
        const createResult = await service.createVerificationChallenge("verify@example.com");
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        // Extract OTP from test email
        const sentHtml = testEmailSender.sentEmails[0].html;
        const match = sentHtml.match(/>(\d{6})</);
        expect(match).not.toBeNull();
        const otpCode = match![1];

        const verifyResult = await service.verifyChallenge(createResult.data.challengeId, otpCode);
        expect(verifyResult.success).toBe(true);
        expect(verifyResult.verificationToken).toBeDefined();
        expect(verifyResult.expiresInSeconds).toBe(600);

        // Verify challenge is removed after success
        const challengeAfter = await memoryStorage.getChallenge(createResult.data.challengeId);
        expect(challengeAfter).toBeNull();

        // Verify token can be consumed once
        const consumed = await service.consumeVerificationToken(
            verifyResult.verificationToken!,
            "verify@example.com"
        );
        expect(consumed).toBe(true);

        // Replay attempt fails
        const replay = await service.consumeVerificationToken(
            verifyResult.verificationToken!,
            "verify@example.com"
        );
        expect(replay).toBe(false);
    });

    it("tracks failed attempts and locks after 5 wrong tries", async () => {
        const createResult = await service.createVerificationChallenge("wrong@example.com");
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        const challengeId = createResult.data.challengeId;

        // Attempts 1 to 4: returns INVALID_CODE with attemptsRemaining
        for (let i = 1; i <= 4; i++) {
            const res = await service.verifyChallenge(challengeId, "000000");
            expect(res.success).toBe(false);
            expect(res.error).toBe("INVALID_CODE");
            expect(res.attemptsRemaining).toBe(5 - i);
        }

        // Attempt 5: returns TOO_MANY_ATTEMPTS and deletes challenge
        const res5 = await service.verifyChallenge(challengeId, "000000");
        expect(res5.success).toBe(false);
        expect(res5.error).toBe("TOO_MANY_ATTEMPTS");

        // Subsequent attempt returns NOT_FOUND because it was deleted
        const res6 = await service.verifyChallenge(challengeId, "000000");
        expect(res6.success).toBe(false);
        expect(res6.error).toBe("NOT_FOUND");
    });

    it("fails token consumption when email does not match", async () => {
        const createResult = await service.createVerificationChallenge("owner@example.com");
        expect(createResult.success).toBe(true);
        if (!createResult.success) return;

        const match = testEmailSender.sentEmails[0].html.match(/>(\d{6})</);
        const otpCode = match![1];

        const verifyResult = await service.verifyChallenge(
            createResult.data.challengeId,
            otpCode
        );

        const consumed = await service.consumeVerificationToken(
            verifyResult.verificationToken!,
            "attacker@example.com"
        );
        expect(consumed).toBe(false);
    });
});
