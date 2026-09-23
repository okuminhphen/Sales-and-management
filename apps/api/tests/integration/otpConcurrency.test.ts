import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRedis, disconnectRedis } from "../../src/config/redis.js";
import {
    MemoryOtpStorage,
    RedisOtpStorage,
    type IOtpStorage,
} from "../../src/modules/auth/otp/otp.repository.js";
import { OtpService } from "../../src/modules/auth/otp/otp.service.js";
import { TestEmailAdapter } from "../../src/infrastructure/mail/index.js";
import { computeOtpCodeHash, hashEmailForAudit } from "../../src/utils/cryptoUtils.js";

const runInfrastructureTests = process.env.RUN_INFRASTRUCTURE_TESTS === "true";

const createConcurrencyTestSuite = (
    storageName: string,
    getStorageInstance: () => IOtpStorage,
    beforeSuite?: () => Promise<void>,
    afterSuite?: () => Promise<void>
) => {
    describe(`OTP Concurrency Suite — ${storageName} (Critical 1 & Required 5)`, () => {
        let storage: IOtpStorage;
        let testSender: TestEmailAdapter;
        let service: OtpService;

        if (beforeSuite) {
            beforeEach(async () => {
                await beforeSuite();
            });
        }

        if (afterSuite) {
            afterEach(async () => {
                await afterSuite();
            });
        }

        beforeEach(() => {
            storage = getStorageInstance();
            testSender = new TestEmailAdapter();
            service = new OtpService(
                () => storage,
                () => testSender
            );
        });

        it("strictly enforces maximum 5 wrong attempts across concurrent verify requests", async () => {
            const email = `concur-wrong-${Date.now()}@example.com`;
            const challengeId = crypto.randomUUID();
            const correctCode = "123456";
            const codeHash = computeOtpCodeHash(email, correctCode);
            const emailHash = hashEmailForAudit(email);

            await storage.saveChallenge(
                {
                    challengeId,
                    email,
                    emailHash,
                    codeHash,
                    attemptsRemaining: 5,
                    createdAt: Date.now(),
                    expiresAt: Date.now() + 300_000,
                },
                300
            );

            // Fire 10 concurrent verify requests with wrong OTP
            const wrongOtpPromises = Array.from({ length: 10 }).map(() =>
                service.verifyChallenge(challengeId, "000000")
            );

            const results = await Promise.all(wrongOtpPromises);

            const invalidCodeResults = results.filter((r) => r.error === "INVALID_CODE");
            const tooManyAttemptsResults = results.filter((r) => r.error === "TOO_MANY_ATTEMPTS");
            const notFoundResults = results.filter((r) => r.error === "NOT_FOUND");
            const successResults = results.filter((r) => r.success);

            // Zero successful verifications
            expect(successResults).toHaveLength(0);

            // Exactly 4 returned INVALID_CODE (attempts 4, 3, 2, 1) and 1 returned TOO_MANY_ATTEMPTS (attempt 0)
            // or if subsequent arrive after deletion, they get NOT_FOUND
            expect(tooManyAttemptsResults.length).toBeGreaterThanOrEqual(1);
            expect(invalidCodeResults.length).toBeLessThanOrEqual(4);

            // Total attempts evaluated before lockout must not exceed 5
            const totalEvaluated = invalidCodeResults.length + tooManyAttemptsResults.length;
            expect(totalEvaluated).toBeLessThanOrEqual(5);

            // Challenge must be completely deleted from storage
            const challengeAfter = await storage.getChallenge(challengeId);
            expect(challengeAfter).toBeNull();
        });

        it("permits only one successful verification and generates only one token under concurrent correct requests", async () => {
            const email = `concur-correct-${Date.now()}@example.com`;
            const challengeId = crypto.randomUUID();
            const correctCode = "654321";
            const codeHash = computeOtpCodeHash(email, correctCode);
            const emailHash = hashEmailForAudit(email);

            await storage.saveChallenge(
                {
                    challengeId,
                    email,
                    emailHash,
                    codeHash,
                    attemptsRemaining: 5,
                    createdAt: Date.now(),
                    expiresAt: Date.now() + 300_000,
                },
                300
            );

            // Fire 6 concurrent requests with the CORRECT code
            const correctPromises = Array.from({ length: 6 }).map(() =>
                service.verifyChallenge(challengeId, correctCode)
            );

            const results = await Promise.all(correctPromises);

            const successful = results.filter((r) => r.success);
            const notFound = results.filter((r) => r.error === "NOT_FOUND");

            // Exactly ONE request must succeed and produce a verification token
            expect(successful).toHaveLength(1);
            expect(successful[0].verificationToken).toBeDefined();

            // All other concurrent requests must fail because challenge was atomically consumed
            expect(notFound).toHaveLength(5);

            // Storage must have cleaned up the challenge
            const challengeAfter = await storage.getChallenge(challengeId);
            expect(challengeAfter).toBeNull();
        });

        it("atomically blocks duplicate challenge creation for the same email via cooldown claim", async () => {
            const email = `concur-cooldown-${Date.now()}@example.com`;

            // Fire 5 concurrent challenge creation requests for the exact same email
            const createPromises = Array.from({ length: 5 }).map(() =>
                service.createVerificationChallenge(email)
            );

            const results = await Promise.all(createPromises);

            const successes = results.filter((r) => r.success);
            const cooldownRejections = results.filter(
                (r) => !r.success && r.error === "COOLDOWN_ACTIVE"
            );

            // Exactly ONE challenge can be created
            expect(successes).toHaveLength(1);

            // All other concurrent requests are rejected by atomic cooldown
            expect(cooldownRejections).toHaveLength(4);

            // Exactly one email was sent
            expect(testSender.sentEmails).toHaveLength(1);
        });

        it("atomically grants only one claim on a verification token under concurrent registration requests", async () => {
            const token = crypto.randomUUID();
            const email = `concur-claim-${Date.now()}@example.com`;

            await storage.saveVerificationToken(
                {
                    token,
                    email,
                    status: "READY",
                    createdAt: Date.now(),
                    expiresAt: Date.now() + 600_000,
                },
                600
            );

            // 5 concurrent requests attempting to claim the same token
            const claimPromises = Array.from({ length: 5 }).map(() =>
                service.claimVerificationToken(token, email)
            );

            const results = await Promise.all(claimPromises);

            const successfulClaims = results.filter((r) => r.success);
            const rejectedClaims = results.filter(
                (r) => !r.success && r.error === "ALREADY_CLAIMED"
            );

            // Exactly ONE request claims the token
            expect(successfulClaims).toHaveLength(1);
            expect(rejectedClaims).toHaveLength(4);
        });
    });
};

// 1. Unconditional Concurrency suite on MemoryOtpStorage
createConcurrencyTestSuite("MemoryOtpStorage", () => new MemoryOtpStorage());

// 2. Real Redis Concurrency suite when RUN_INFRASTRUCTURE_TESTS=true
describe.skipIf(!runInfrastructureTests)("RedisOtpStorage Real Infrastructure Concurrency", () => {
    let redisClient: any;

    createConcurrencyTestSuite(
        "RedisOtpStorage (Real Redis)",
        () => new RedisOtpStorage(() => redisClient),
        async () => {
            redisClient = await connectRedis();
        },
        async () => {
            await disconnectRedis();
        }
    );
});
