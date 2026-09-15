import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().positive().default(8080),
    FRONTEND_URL: z.string().default("http://localhost:3000"),
    JWT_SECRET: z.string().min(3).default("development-only-secret"),
    MYSQL_HOST: z.string().default("localhost"),
    MYSQL_PORT: z.coerce.number().int().positive().default(3306),
    MYSQL_DATABASE: z.string().default("btl_tmdt"),
    MYSQL_USER: z.string().default("root"),
    MYSQL_PASSWORD: z.string().default(""),
    DEFAULT_FULFILLMENT_BRANCH_ID: z.coerce.number().int().positive().default(13),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
    CHAT_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(1_000).default(30),
    CHAT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().max(3_600).default(60),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
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
