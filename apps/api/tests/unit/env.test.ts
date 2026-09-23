import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv", () => {
    it("applies safe local defaults", () => {
        const result = parseEnv({ NODE_ENV: "test" });

        expect(result.API_PORT).toBe(8080);
        expect(result.MYSQL_DATABASE).toBe("sale_and_managements_db");
        expect(result.AI_SERVICE_URL).toBe("http://localhost:8000");
        expect(result.VNP_URL).toContain("sandbox.vnpayment.vn");
        expect(result.RECAPTCHA_ENABLED).toBe(false);
    });

    it("requires a reCAPTCHA secret when server-side enforcement is enabled", () => {
        expect(() =>
            parseEnv({ NODE_ENV: "test", RECAPTCHA_ENABLED: "true", RECAPTCHA_SECRET_KEY: "" })
        ).toThrow(/RECAPTCHA_SECRET_KEY must be set/);
    });

    it("rejects production configuration that disables reCAPTCHA", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
                PAYMENT_WEBHOOK_SECRET: "webhook-secret",
                RESEND_API_KEY: "re_test_key_123",
                OTP_HMAC_SECRET: "strong-production-secret-min-16-bytes",
                EMAIL_PROVIDER: "resend",
                EMAIL_FROM: "HappyShop <no-reply@happyshop.vn>",
                RECAPTCHA_ENABLED: "false",
            })
        ).toThrow(/RECAPTCHA_ENABLED must be true in production/);
    });

    it("requires an explicit reCAPTCHA hostname allowlist in production", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
                PAYMENT_WEBHOOK_SECRET: "webhook-secret",
                RESEND_API_KEY: "re_test_key_123",
                OTP_HMAC_SECRET: "strong-production-secret-min-16-bytes",
                EMAIL_PROVIDER: "resend",
                EMAIL_FROM: "HappyShop <no-reply@happyshop.vn>",
                RECAPTCHA_ENABLED: "true",
                RECAPTCHA_SECRET_KEY: "production-recaptcha-secret",
                RECAPTCHA_ALLOWED_HOSTNAMES: "",
            })
        ).toThrow(/RECAPTCHA_ALLOWED_HOSTNAMES must be set in production/);
    });

    it("rejects the development JWT secret in production", () => {
        expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(
            /JWT_SECRET must be set in production/
        );
    });

    it("rejects missing VNPay credentials in production", () => {
        expect(() =>
            parseEnv({ NODE_ENV: "production", JWT_SECRET: "a-secure-production-secret" })
        ).toThrow(/VNPay credentials must be set in production/);
    });

    it("rejects an unsigned payment webhook configuration in production", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
            })
        ).toThrow(/PAYMENT_WEBHOOK_SECRET must be set in production/);
    });

    it("rejects missing RESEND_API_KEY in production when provider is resend", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
                PAYMENT_WEBHOOK_SECRET: "webhook-secret",
                EMAIL_PROVIDER: "resend",
                RESEND_API_KEY: "",
            })
        ).toThrow(/RESEND_API_KEY must be set in production/);
    });

    it("rejects dev OTP_HMAC_SECRET in production", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
                PAYMENT_WEBHOOK_SECRET: "webhook-secret",
                RESEND_API_KEY: "re_test_key_123",
                EMAIL_FROM: "HappyShop <no-reply@happyshop.vn>",
                OTP_HMAC_SECRET: "dev-otp-hmac-secret-min-16-bytes",
            })
        ).toThrow(/OTP_HMAC_SECRET must be set with a strong secret in production/);
    });

    it("rejects default or missing EMAIL_FROM in production when provider is resend", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
                PAYMENT_WEBHOOK_SECRET: "webhook-secret",
                RESEND_API_KEY: "re_test_key_123",
                OTP_HMAC_SECRET: "strong-production-secret-min-16-bytes",
                EMAIL_PROVIDER: "resend",
                EMAIL_FROM: "HappyShop <onboarding@resend.dev>",
            })
        ).toThrow(/EMAIL_FROM must be configured with a production sender address/);
    });

    it("accepts fully configured production environment", () => {
        const result = parseEnv({
            NODE_ENV: "production",
            JWT_SECRET: "a-secure-production-secret",
            VNP_TMN_CODE: "merchant",
            VNP_HASH_SECRET: "payment-secret",
            PAYMENT_WEBHOOK_SECRET: "webhook-secret",
            RESEND_API_KEY: "re_test_key_123",
            OTP_HMAC_SECRET: "strong-production-secret-min-16-bytes",
            EMAIL_PROVIDER: "resend",
            EMAIL_FROM: "HappyShop <no-reply@happyshop.vn>",
            RECAPTCHA_ENABLED: "true",
            RECAPTCHA_SECRET_KEY: "production-recaptcha-secret",
            RECAPTCHA_ALLOWED_HOSTNAMES: "shop.example.com",
        });
        expect(result.EMAIL_FROM).toBe("HappyShop <no-reply@happyshop.vn>");
        expect(result.RESEND_API_KEY).toBe("re_test_key_123");
    });
});
