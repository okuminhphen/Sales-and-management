import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadDotEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().positive().default(8080),
    FRONTEND_URL: z.string().default("http://localhost:3000"),
    JWT_SECRET: z.string().min(3).default("development-only-secret"),
    MYSQL_HOST: z.string().default("localhost"),
    MYSQL_PORT: z.coerce.number().int().positive().default(3306),
    MYSQL_DATABASE: z.string().default("sale_and_managements_db"),
    MYSQL_USER: z.string().default("root"),
    MYSQL_PASSWORD: z.string().default(""),
    DEFAULT_FULFILLMENT_BRANCH_ID: z.coerce.number().int().positive().default(13),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    RABBITMQ_URL: z.string().url().default("amqp://sales_app:local-rabbitmq-password-change-me@localhost:5672/sales_dev"),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
    AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
    CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(1_000).default(30),
    CHAT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().max(3_600).default(60),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    RECAPTCHA_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    RECAPTCHA_SECRET_KEY: z.string().default(""),
    RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
    RECAPTCHA_ALLOWED_HOSTNAMES: z.string().default(""),
    RECAPTCHA_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
    EMAIL_PROVIDER: z.enum(["resend", "test"]).default("resend"),
    RESEND_API_KEY: z.string().default(""),
    EMAIL_FROM: z.string().default("HappyShop <onboarding@resend.dev>"),
    OTP_HMAC_SECRET: z.string().min(16).default("dev-otp-hmac-secret-min-16-bytes"),
    EMAIL_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
    VNP_TMN_CODE: z.string().default(""),
    VNP_HASH_SECRET: z.string().default(""),
    VNP_URL: z
      .string()
      .url()
      .default("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),
    VNP_RETURN_URL: z
      .string()
      .url()
      .default("http://localhost:8080/api/v1/payment-return"),
    PAYMENT_WEBHOOK_SECRET: z.string().default("")
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.RECAPTCHA_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["RECAPTCHA_ENABLED"],
        message: "RECAPTCHA_ENABLED must be true in production"
      });
    }
    if (value.RECAPTCHA_ENABLED && !value.RECAPTCHA_SECRET_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RECAPTCHA_SECRET_KEY"],
        message: "RECAPTCHA_SECRET_KEY must be set when RECAPTCHA_ENABLED is true"
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.RECAPTCHA_ENABLED &&
      !value.RECAPTCHA_ALLOWED_HOSTNAMES.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["RECAPTCHA_ALLOWED_HOSTNAMES"],
        message: "RECAPTCHA_ALLOWED_HOSTNAMES must be set in production"
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.JWT_SECRET === "development-only-secret"
    ) {
      context.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be set in production"
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.EMAIL_PROVIDER === "resend" &&
      !value.RESEND_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY must be set in production when EMAIL_PROVIDER is resend"
      });
    }
    if (
      value.NODE_ENV === "production" &&
      value.EMAIL_PROVIDER === "resend" &&
      (!value.EMAIL_FROM || value.EMAIL_FROM === "HappyShop <onboarding@resend.dev>")
    ) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM must be configured with a production sender address when EMAIL_PROVIDER is resend"
      });
    }
    if (
      value.NODE_ENV === "production" &&
      (!value.OTP_HMAC_SECRET || value.OTP_HMAC_SECRET === "dev-otp-hmac-secret-min-16-bytes")
    ) {
      context.addIssue({
        code: "custom",
        path: ["OTP_HMAC_SECRET"],
        message: "OTP_HMAC_SECRET must be set with a strong secret in production"
      });
    }
    if (
      value.NODE_ENV === "production" &&
      (!value.VNP_TMN_CODE || !value.VNP_HASH_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        path: ["VNP_TMN_CODE"],
        message: "VNPay credentials must be set in production"
      });
    }
    if (value.NODE_ENV === "production" && !value.PAYMENT_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["PAYMENT_WEBHOOK_SECRET"],
        message: "PAYMENT_WEBHOOK_SECRET must be set in production"
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export const parseEnv = (source: NodeJS.ProcessEnv): AppEnv =>
  envSchema.parse(source);

export const env = parseEnv(process.env);
