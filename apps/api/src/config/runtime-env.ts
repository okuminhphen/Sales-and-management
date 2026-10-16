import "./load-env.js";
import { z } from "zod";

export const runtimeEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
export const runtimeEnv = runtimeEnvSchema.parse(process.env);
