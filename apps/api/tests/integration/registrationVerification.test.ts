import crypto from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { logger } from "../../src/observability/logger.js";
import { setEmailSender, TestEmailAdapter } from "../../src/infrastructure/mail/index.js";
import { MemoryOtpStorage, setOtpStorage } from "../../src/modules/auth/otp/otp.repository.js";
import customerAuthService from "../../src/modules/auth/customer-auth.service.js";
import db from "../../src/models/index.js";

describe("Registration Email Verification Integration (Required 3 & Required 6)", () => {
    let app: ReturnType<typeof createApp>;
    let testStorage: MemoryOtpStorage;
    let testSender: TestEmailAdapter;

    beforeEach(() => {
        testStorage = new MemoryOtpStorage();
        testSender = new TestEmailAdapter();
        setOtpStorage(testStorage);
        setEmailSender(testSender);
        app = createApp();
    });

    afterEach(() => {
        setOtpStorage(undefined);
        setEmailSender(undefined);
        vi.restoreAllMocks();
    });

    it("rejects registration requests without emailVerificationToken", async () => {
        const response = await request(app)
            .post("/api/v1/register")
            .send({
                email: "notoken@example.com",
                phone: "0901234567",
                username: "notokenuser",
                password: "password123",
            });

        expect(response.status).toBe(400);
        expect(response.body.EC).toBe(1);
        expect(response.body.EM).toBe("Request validation failed");
    });

    it("rejects registration requests with non-UUID verification token", async () => {
        const response = await request(app)
            .post("/api/v1/register")
            .send({
                email: "badtoken@example.com",
                phone: "0901234567",
                username: "badtokenuser",
                password: "password123",
                emailVerificationToken: "non-uuid-random-token",
            });

        expect(response.status).toBe(400);
        expect(response.body.EC).toBe(1);
        expect(response.body.EM).toBe("Request validation failed");
    });

    // Test 7: Email mismatch does not consume/claim wrong token
    it("rejects token when email in payload does not match token email, preserving token", async () => {
        const token = crypto.randomUUID();
        const ownerEmail = "owner@example.com";
        const attackerEmail = "attacker@example.com";

        await testStorage.saveVerificationToken(
            {
                token,
                email: ownerEmail,
                status: "READY",
                createdAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            },
            600
        );

        const response = await request(app)
            .post("/api/v1/register")
            .send({
                email: attackerEmail,
                phone: "0901234567",
                username: "attacker",
                password: "password123",
                emailVerificationToken: token,
            });

        expect(response.status).toBe(200);
        expect(response.body.EC).toBe(1);
        expect(response.body.EM).toContain("Email xác thực không khớp");

        // Verify owner's token is NOT consumed or deleted
        const tokenAfter = await testStorage.getVerificationToken(token);
        expect(tokenAfter).toBeDefined();
        expect(tokenAfter?.email).toBe(ownerEmail);
        expect(tokenAfter?.status).toBe("READY");
    });

    // Test 1: DB transaction rollback → token released → retry works
    it("recovers and releases token on database transaction rollback, allowing safe retry", async () => {
        const token = crypto.randomUUID();
        const email = "retryuser@example.com";

        await testStorage.saveVerificationToken(
            {
                token,
                email,
                status: "READY",
                createdAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            },
            600
        );

        vi.spyOn(db.User, "findOne").mockResolvedValue(null as any);
        vi.spyOn(db.Role, "findOne").mockResolvedValue({ id: 2, name: "customer" } as any);

        const mockTransaction = {
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(db.sequelize, "transaction").mockResolvedValue(mockTransaction as any);

        vi.spyOn(db.User, "create")
            .mockRejectedValueOnce(new Error("Database deadlock / connection lost"))
            .mockResolvedValueOnce({
                id: 101,
                email,
                username: "retryuser",
                phone: "0901234567",
            } as any);

        vi.spyOn(db.UserRole, "create").mockResolvedValue({} as any);

        // 1st attempt: db.User.create fails → rollback
        const firstResult = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "retryuser",
            password: "password123",
            emailVerificationToken: token,
        });

        expect(firstResult.EC).toBe(-2);
        expect(mockTransaction.rollback).toHaveBeenCalled();

        // Token must be RELEASED back to READY
        const tokenAfterRollback = await testStorage.getVerificationToken(token);
        expect(tokenAfterRollback).toBeDefined();
        expect(tokenAfterRollback?.status).toBe("READY");

        // 2nd attempt: retry with same token succeeds
        const secondResult = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "retryuser",
            password: "password123",
            emailVerificationToken: token,
        });

        expect(secondResult.EC).toBe(0);
        expect(mockTransaction.commit).toHaveBeenCalled();

        // Token must now be FINALIZED (deleted)
        const tokenAfterSuccess = await testStorage.getVerificationToken(token);
        expect(tokenAfterSuccess).toBeNull();
    });

    // Test 2: DB commit + finalize success → returns success
    it("returns success when DB commits and finalize succeeds", async () => {
        const token = crypto.randomUUID();
        const email = "normal@example.com";

        await testStorage.saveVerificationToken(
            {
                token,
                email,
                status: "READY",
                createdAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            },
            600
        );

        vi.spyOn(db.User, "findOne").mockResolvedValue(null as any);
        vi.spyOn(db.Role, "findOne").mockResolvedValue({ id: 2, name: "customer" } as any);

        const mockTransaction = {
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(db.sequelize, "transaction").mockResolvedValue(mockTransaction as any);
        vi.spyOn(db.User, "create").mockResolvedValue({
            id: 300,
            email,
            username: "normaluser",
        } as any);
        vi.spyOn(db.UserRole, "create").mockResolvedValue({} as any);

        const result = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "normaluser",
            password: "password123",
            emailVerificationToken: token,
        });

        expect(result.EC).toBe(0);
        expect(mockTransaction.commit).toHaveBeenCalled();
        expect(mockTransaction.rollback).not.toHaveBeenCalled();

        // Token should be finalized (deleted)
        const tokenAfter = await testStorage.getVerificationToken(token);
        expect(tokenAfter).toBeNull();
    });

    // Test 3: DB commit + finalize returns false → still returns success
    it("returns success even when finalizeVerificationToken returns false after DB commit", async () => {
        const token = crypto.randomUUID();
        const email = "finalize-false@example.com";

        await testStorage.saveVerificationToken(
            {
                token,
                email,
                status: "READY",
                createdAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            },
            600
        );

        vi.spyOn(db.User, "findOne").mockResolvedValue(null as any);
        vi.spyOn(db.Role, "findOne").mockResolvedValue({ id: 2, name: "customer" } as any);

        const mockTransaction = {
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(db.sequelize, "transaction").mockResolvedValue(mockTransaction as any);
        vi.spyOn(db.User, "create").mockResolvedValue({
            id: 201,
            email,
            username: "finalizefalseuser",
        } as any);
        vi.spyOn(db.UserRole, "create").mockResolvedValue({} as any);

        // Make finalizeVerificationToken return false (token not found / already deleted)
        vi.spyOn(testStorage, "finalizeVerificationToken").mockResolvedValueOnce(false);
        const releaseSpy = vi.spyOn(testStorage, "releaseVerificationToken");
        const warnSpy = vi.spyOn(logger, "warn");

        const result = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "finalizefalseuser",
            password: "password123",
            emailVerificationToken: token,
        });

        // DB commit happened — API must still report success
        expect(result.EC).toBe(0);
        expect(mockTransaction.commit).toHaveBeenCalled();
        expect(mockTransaction.rollback).not.toHaveBeenCalled();
        expect(releaseSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            "registration.finalize_token_incomplete",
            expect.objectContaining({ emailHash: expect.any(String) })
        );
    });

    // Test 4: DB commit + finalize throws → still returns success
    it("returns success even when finalizeVerificationToken throws after DB commit", async () => {
        const token = crypto.randomUUID();
        const email = "finalize-fail@example.com";

        await testStorage.saveVerificationToken(
            {
                token,
                email,
                status: "READY",
                createdAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            },
            600
        );

        vi.spyOn(db.User, "findOne").mockResolvedValue(null as any);
        vi.spyOn(db.Role, "findOne").mockResolvedValue({ id: 2, name: "customer" } as any);

        const mockTransaction = {
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(db.sequelize, "transaction").mockResolvedValue(mockTransaction as any);
        vi.spyOn(db.User, "create").mockResolvedValue({
            id: 200,
            email,
            username: "finalizefailuser",
        } as any);
        vi.spyOn(db.UserRole, "create").mockResolvedValue({} as any);

        // Make finalizeVerificationToken throw AFTER commit succeeds
        vi.spyOn(testStorage, "finalizeVerificationToken").mockRejectedValueOnce(
            new Error("Redis ConnectionRefused")
        );
        const releaseSpy = vi.spyOn(testStorage, "releaseVerificationToken");

        const result = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "finalizefailuser",
            password: "password123",
            emailVerificationToken: token,
        });

        // DB commit happened — API must still report success
        expect(result.EC).toBe(0);
        expect(mockTransaction.commit).toHaveBeenCalled();
        // Test 5: After commit, no rollback or release should be called
        expect(mockTransaction.rollback).not.toHaveBeenCalled();
        expect(releaseSpy).not.toHaveBeenCalled();
    });

    // Test 6: Replay after finalize is rejected
    it("prevents replay attacks by finalizing token after successful registration", async () => {
        const token = crypto.randomUUID();
        const email = "replay@example.com";

        await testStorage.saveVerificationToken(
            {
                token,
                email,
                status: "READY",
                createdAt: Date.now(),
                expiresAt: Date.now() + 600_000,
            },
            600
        );

        vi.spyOn(db.User, "findOne").mockResolvedValue(null as any);
        vi.spyOn(db.Role, "findOne").mockResolvedValue({ id: 2, name: "customer" } as any);
        vi.spyOn(db.sequelize, "transaction").mockResolvedValue({
            commit: vi.fn().mockResolvedValue(undefined),
            rollback: vi.fn().mockResolvedValue(undefined),
        } as any);
        vi.spyOn(db.User, "create").mockResolvedValue({
            id: 102,
            email,
            username: "replayuser",
        } as any);
        vi.spyOn(db.UserRole, "create").mockResolvedValue({} as any);

        // First registration succeeds
        const first = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "replayuser",
            password: "password123",
            emailVerificationToken: token,
        });
        expect(first.EC).toBe(0);

        // Replay attempt with same token fails
        const replay = await customerAuthService.registerNewUser({
            email,
            phone: "0901234567",
            username: "replayuser",
            password: "password123",
            emailVerificationToken: token,
        });
        expect(replay.EC).toBe(1);
        expect(replay.EM).toContain("Mã xác thực email không hợp lệ hoặc đã hết hạn");
    });
});
