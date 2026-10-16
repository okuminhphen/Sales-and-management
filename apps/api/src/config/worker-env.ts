import { z } from "zod";
import { databaseEnvSchema } from "./database-env.js";

export const parseWorkerEnv = (source: NodeJS.ProcessEnv, kind: "outbox" | "expiry") => {
    const schema = databaseEnvSchema.extend({
        RABBITMQ_URL: z.string().url().default("amqp://sales_app:local-rabbitmq-password-change-me@localhost:5672/sales_dev"),
        OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
        V2_OUTBOX_PUBLISHER_ENABLED: z.enum(["true", "false"]).default("false"),
        V2_INVENTORY_RESERVATION_EXPIRY_ENABLED: z.enum(["true", "false"]).default("false"),
    }).superRefine((value, context) => {
        const flag = kind === "outbox" ? "V2_OUTBOX_PUBLISHER_ENABLED" : "V2_INVENTORY_RESERVATION_EXPIRY_ENABLED";
        if (value[flag] !== "true") context.addIssue({ code: "custom", path: [flag], message: "Worker requires explicit opt-in after V2 cutover." });
        if (value.NODE_ENV === "production") {
            const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD",
                ...(kind === "outbox" ? ["RABBITMQ_URL"] : [])];
            for (const field of required) {
                if (!source[field]?.trim()) context.addIssue({ code: "custom", path: [field], message: "Explicit production worker configuration is required." });
            }
        }
    });
    return schema.parse(source);
};
