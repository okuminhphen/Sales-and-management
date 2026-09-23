import axios from "axios";
import { z } from "zod";
import { env } from "../../config/env.js";
import type {
    RecaptchaVerificationResult,
    RecaptchaVerifier,
    VerifyRecaptchaInput,
} from "./recaptcha-verifier.port.js";

const googleRecaptchaResponse = z.object({
    success: z.boolean(),
    score: z.number().min(0).max(1).optional(),
    action: z.string().optional(),
    hostname: z.string().optional(),
});

interface RecaptchaHttpClient {
    post(url: string, body: string, config: { headers: Record<string, string>; timeout: number }): Promise<{ data: unknown }>;
}

export interface GoogleRecaptchaAdapterOptions {
    secretKey?: string;
    minimumScore?: number;
    allowedHostnames?: string[];
    timeoutMs?: number;
    client?: RecaptchaHttpClient;
}

export class RecaptchaProviderError extends Error {
    constructor() {
        super("reCAPTCHA provider request failed");
        this.name = "RecaptchaProviderError";
    }
}

export class GoogleRecaptchaAdapter implements RecaptchaVerifier {
    private readonly secretKey: string;
    private readonly minimumScore: number;
    private readonly allowedHostnames: Set<string>;
    private readonly timeoutMs: number;
    private readonly client: RecaptchaHttpClient;

    constructor(options: GoogleRecaptchaAdapterOptions = {}) {
        this.secretKey = options.secretKey ?? env.RECAPTCHA_SECRET_KEY;
        this.minimumScore = options.minimumScore ?? env.RECAPTCHA_MIN_SCORE;
        const allowedHostnames = options.allowedHostnames ??
            env.RECAPTCHA_ALLOWED_HOSTNAMES
                .split(",")
                .map((hostname) => hostname.trim().toLowerCase())
                .filter(Boolean);
        this.allowedHostnames = new Set(allowedHostnames);
        this.timeoutMs = options.timeoutMs ?? env.RECAPTCHA_TIMEOUT_MS;
        this.client = options.client ?? axios;
    }

    async verify(input: VerifyRecaptchaInput): Promise<RecaptchaVerificationResult> {
        const form = new URLSearchParams({
            secret: this.secretKey,
            response: input.token,
        });
        if (input.remoteIp) form.set("remoteip", input.remoteIp);

        let rawResponse: unknown;
        try {
            const response = await this.client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                form.toString(),
                {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    timeout: this.timeoutMs,
                }
            );
            rawResponse = response.data;
        } catch {
            throw new RecaptchaProviderError();
        }

        const parsed = googleRecaptchaResponse.safeParse(rawResponse);
        if (!parsed.success) return { valid: false, reason: "PROVIDER_RESPONSE_INVALID" };

        const result = parsed.data;
        if (!result.success) return { valid: false, reason: "INVALID_TOKEN" };
        if (result.action !== input.expectedAction) {
            return { valid: false, reason: "ACTION_MISMATCH" };
        }
        if (typeof result.score !== "number") {
            return { valid: false, reason: "PROVIDER_RESPONSE_INVALID" };
        }
        if (result.score < this.minimumScore) {
            return { valid: false, reason: "SCORE_TOO_LOW" };
        }
        if (
            this.allowedHostnames.size > 0 &&
            (!result.hostname || !this.allowedHostnames.has(result.hostname.toLowerCase()))
        ) {
            return { valid: false, reason: "HOSTNAME_MISMATCH" };
        }

        return { valid: true };
    }
}
