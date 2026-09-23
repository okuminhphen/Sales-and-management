import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * Creates a domain-separated HMAC-SHA256 digest of an email address for logging and correlation.
 * Prevents dictionary attacks and does not expose raw PII.
 */
export const hashEmailForAudit = (email: string, secret = env.OTP_HMAC_SECRET): string => {
    const normalized = email.trim().toLowerCase();
    return crypto
        .createHmac("sha256", secret)
        .update(`email-audit:${normalized}`)
        .digest("hex");
};

/**
 * Creates a domain-separated HMAC-SHA256 digest for OTP code verification.
 */
export const computeOtpCodeHash = (email: string, code: string, secret = env.OTP_HMAC_SECRET): string => {
    const normalized = email.trim().toLowerCase();
    return crypto
        .createHmac("sha256", secret)
        .update(`otp-code:${normalized}:${code.trim()}`)
        .digest("hex");
};

/**
 * Constant-time comparison between two hex strings.
 */
export const timingSafeHexEqual = (hexA: string, hexB: string): boolean => {
    const bufA = Buffer.from(hexA, "hex");
    const bufB = Buffer.from(hexB, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};
