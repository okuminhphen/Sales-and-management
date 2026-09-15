import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const redactedKeys = new Set([
    "authorization",
    "cookie",
    "password",
    "token",
    "accesstoken",
    "refreshtoken",
    "apikey",
    "api_key",
    "secret",
]);

const levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const sanitize = (value: unknown, key?: string): unknown => {
    if (key && redactedKeys.has(key.toLowerCase())) return "[REDACTED]";
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
    }
    if (Array.isArray(value)) return value.map((item) => sanitize(item));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
                entryKey,
                sanitize(entryValue, entryKey),
            ]),
        );
    }
    return value;
};

const write = (level: LogLevel, message: string, context: LogContext = {}): void => {
    if (levelOrder[level] < levelOrder[env.LOG_LEVEL]) return;
    const sanitizedContext = sanitize(context) as LogContext;

    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: "sales-api",
        message,
        ...sanitizedContext,
    });

    if (level === "error") {
        console.error(entry);
        return;
    }
    console.log(entry);
};

export const logger = {
    debug: (message: string, context?: LogContext): void => write("debug", message, context),
    info: (message: string, context?: LogContext): void => write("info", message, context),
    warn: (message: string, context?: LogContext): void => write("warn", message, context),
    error: (message: string, context?: LogContext): void => write("error", message, context),
};
