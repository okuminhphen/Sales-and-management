import crypto from "node:crypto";
import { env } from "../../../config/env.js";
import { getEmailSender } from "../../../infrastructure/mail/index.js";
import { logger } from "../../../observability/logger.js";
import { computeOtpCodeHash, hashEmailForAudit, timingSafeHexEqual } from "../../../utils/cryptoUtils.js";
import { getOtpStorage, type IOtpStorage } from "./otp.repository.js";
import type {
    ClaimTokenResult,
    CreateChallengeOutcome,
    VerificationTokenData,
    VerifyOtpResult,
} from "./otp.types.js";

const OTP_TTL_SECONDS = 300; // 5 phút
const COOLDOWN_SECONDS = 60; // 60 giây
const VERIFY_TOKEN_TTL_SECONDS = 600; // 10 phút
const MAX_ATTEMPTS = 5;

export class OtpService {
    constructor(
        private readonly getStorage: () => IOtpStorage = getOtpStorage,
        private readonly getSender = getEmailSender
    ) {}

    private normalizeEmail(email: string): string {
        return email.trim().toLowerCase();
    }

    public hashEmail(email: string): string {
        return hashEmailForAudit(email);
    }

    private generateOtpCode(): string {
        return crypto.randomInt(100000, 1000000).toString();
    }

    async createVerificationChallenge(rawEmail: string): Promise<CreateChallengeOutcome> {
        const email = this.normalizeEmail(rawEmail);
        const emailHash = this.hashEmail(email);
        const storage = this.getStorage();

        // 1. Kiểm tra và claim cooldown nguyên tử bằng SET NX EX (Required 5)
        const cooldownResult = await storage.claimCooldown(emailHash, COOLDOWN_SECONDS);
        if (!cooldownResult.acquired) {
            return {
                success: false,
                error: "COOLDOWN_ACTIVE",
                retryAfterSeconds: cooldownResult.remainingTtl,
            };
        }

        // 2. Vô hiệu hóa challenge cũ nếu có
        const oldChallengeId = await storage.getActiveChallengeId(emailHash);
        if (oldChallengeId) {
            await storage.deleteChallenge(oldChallengeId, emailHash);
        }

        // 3. Sinh challenge mới và mã OTP
        const challengeId = crypto.randomUUID();
        const code = this.generateOtpCode();
        const codeHash = computeOtpCodeHash(email, code);
        const now = Date.now();

        const challengeData = {
            challengeId,
            email,
            emailHash,
            codeHash,
            attemptsRemaining: MAX_ATTEMPTS,
            createdAt: now,
            expiresAt: now + OTP_TTL_SECONDS * 1000,
        };

        // 4. Lưu challenge và đặt active challenge ID
        await storage.saveChallenge(challengeData, OTP_TTL_SECONDS);
        await storage.setActiveChallengeId(emailHash, challengeId, OTP_TTL_SECONDS);

        // 5. Gửi email đồng bộ có timeout
        try {
            const sender = this.getSender();
            const subject = "Mã xác thực đăng ký tài khoản HappyShop";
            const html = `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #1e293b; margin: 0;">Mã xác thực email</h2>
                        <p style="color: #64748b; font-size: 14px; margin-top: 6px;">Cảm ơn bạn đã đăng ký tại HappyShop</p>
                    </div>
                    <p style="color: #334155; font-size: 15px; line-height: 1.5;">Dưới đây là mã OTP để hoàn tất quá trình xác thực email của bạn:</p>
                    <div style="text-align: center; margin: 28px 0;">
                        <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #ff5d9e; background: #fff0f5; padding: 12px 28px; border-radius: 8px; display: inline-block; border: 1px dashed #f9c6d8;">${code}</span>
                    </div>
                    <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
                        • Mã xác thực có hiệu lực trong <strong>5 phút</strong>.<br />
                        • Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản của bạn.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.</p>
                </div>
            `;

            await sender.send({
                to: email,
                subject,
                html,
            });

            // Log sanitized (no raw email, no raw OTP, no secret)
            logger.info("otp.challenge_created", {
                challengeId,
                emailHash,
                expiresInSeconds: OTP_TTL_SECONDS,
            });

            return {
                success: true,
                data: {
                    challengeId,
                    expiresInSeconds: OTP_TTL_SECONDS,
                    resendAfterSeconds: COOLDOWN_SECONDS,
                },
            };
        } catch (error) {
            // Rollback challenge và cooldown nếu gửi email thất bại
            await storage.deleteChallenge(challengeId, emailHash);
            await storage.releaseCooldown(emailHash);

            logger.error("otp.send_email_failed", {
                challengeId,
                emailHash,
                errorName: error instanceof Error ? error.name : "UnknownError",
            });

            return {
                success: false,
                error: "PROVIDER_ERROR",
                message: "Không thể gửi email xác thực vào lúc này. Vui lòng thử lại sau.",
            };
        }
    }

    async verifyChallenge(challengeId: string, inputOtp: string): Promise<VerifyOtpResult> {
        const storage = this.getStorage();
        const existing = await storage.getChallenge(challengeId);

        if (!existing || Date.now() > existing.expiresAt) {
            return {
                success: false,
                error: "NOT_FOUND",
            };
        }

        if (existing.attemptsRemaining <= 0) {
            await storage.deleteChallenge(challengeId, existing.emailHash);
            return {
                success: false,
                error: "TOO_MANY_ATTEMPTS",
                attemptsRemaining: 0,
            };
        }

        // Tính codeHash kỳ vọng
        const expectedCodeHash = computeOtpCodeHash(existing.email, inputOtp.trim());
        const newToken = crypto.randomUUID();
        const now = Date.now();

        const tokenData: VerificationTokenData = {
            token: newToken,
            email: existing.email,
            status: "READY",
            createdAt: now,
            expiresAt: now + VERIFY_TOKEN_TTL_SECONDS * 1000,
        };

        // Thực hiện atomic verify trong Redis / memory (Critical 1)
        const verifyOutcome = await storage.atomicVerifyChallenge(
            challengeId,
            expectedCodeHash,
            tokenData,
            VERIFY_TOKEN_TTL_SECONDS
        );

        if (verifyOutcome.status === "SUCCESS") {
            logger.info("otp.verified_success", {
                challengeId,
                emailHash: existing.emailHash,
            });

            return {
                success: true,
                verificationToken: newToken,
                expiresInSeconds: VERIFY_TOKEN_TTL_SECONDS,
            };
        }

        if (verifyOutcome.status === "TOO_MANY_ATTEMPTS") {
            logger.warn("otp.attempts_exhausted", {
                challengeId,
                emailHash: existing.emailHash,
            });
            return {
                success: false,
                error: "TOO_MANY_ATTEMPTS",
                attemptsRemaining: 0,
            };
        }

        if (verifyOutcome.status === "INVALID_CODE") {
            return {
                success: false,
                error: "INVALID_CODE",
                attemptsRemaining: verifyOutcome.attemptsRemaining,
            };
        }

        return {
            success: false,
            error: "NOT_FOUND",
        };
    }

    async claimVerificationToken(token: string, rawEmail: string): Promise<ClaimTokenResult> {
        if (!token || !rawEmail) {
            return { success: false, error: "NOT_FOUND" };
        }
        const email = this.normalizeEmail(rawEmail);
        const storage = this.getStorage();
        return storage.claimVerificationToken(token, email);
    }

    async releaseVerificationToken(token: string): Promise<boolean> {
        if (!token) return false;
        const storage = this.getStorage();
        return storage.releaseVerificationToken(token);
    }

    async finalizeVerificationToken(token: string): Promise<boolean> {
        if (!token) return false;
        const storage = this.getStorage();
        return storage.finalizeVerificationToken(token);
    }

    async consumeVerificationToken(token: string, rawEmail: string): Promise<boolean> {
        const claim = await this.claimVerificationToken(token, rawEmail);
        if (!claim.success) return false;
        return this.finalizeVerificationToken(token);
    }
}

export const otpService = new OtpService();
