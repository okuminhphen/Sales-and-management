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

/**
 * Regex patterns to detect PII/secrets embedded in string values.
 * Applied after key-based redaction to catch leaked data in error messages,
 * stack traces, or provider responses.
 */
const piiPatterns: Array<{ pattern: RegExp; replacement: string }> = [
    // Email addresses (simple, broad)
    { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[EMAIL_REDACTED]" },
    // Resend API keys (re_...)
    { pattern: /re_[A-Za-z0-9_-]{10,}/g, replacement: "[APIKEY_REDACTED]" },
    // Standalone 6-digit OTP codes, including start/end-of-string boundaries.
    // Alphanumeric boundaries avoid corrupting hashes, UUIDs, and provider IDs.
    { pattern: /(?<![A-Za-z0-9])\d{6}(?![A-Za-z0-9])/g, replacement: "[OTP_REDACTED]" },
];

/**
 * Scrubs string values of any embedded PII/secrets that may have leaked
 * through error messages, stack traces, or SDK responses.
 */
const scrubString = (value: string): string => {
    let scrubbed = value;
    for (const { pattern, replacement } of piiPatterns) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        scrubbed = scrubbed.replace(pattern, replacement);
    }
    return scrubbed;
};

const sanitize = (value: unknown, key?: string): unknown => {
    if (key && redactedKeys.has(key.toLowerCase())) return "[REDACTED]";
    if (typeof value === "string") return scrubString(value);
    if (value instanceof Error) {
        return {
            name: value.name,
            message: scrubString(value.message),
            // Omit stack in production to avoid leaking PII from provider SDKs
            ...(env.NODE_ENV !== "production" ? { stack: scrubString(value.stack ?? "") } : {}),
        };
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
        message: scrubString(message),
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
