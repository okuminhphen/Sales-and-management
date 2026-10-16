import { z } from "zod";
import { runtimeEnvSchema } from "./runtime-env.js";

export const databaseEnvSchema = runtimeEnvSchema.extend({
    MYSQL_HOST: z.string().min(1).default("localhost"),
    MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    MYSQL_DATABASE: z.string().min(1).default("sale_and_managements_db"),
    MYSQL_USER: z.string().min(1).default("root"),
    MYSQL_PASSWORD: z.string().default(""),
});
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export const databaseEnv = databaseEnvSchema.parse(process.env);
