import { Resend } from "resend";
import type { EmailSender, SendEmailOptions, SendEmailResult } from "./email-sender.port.js";
import { env } from "../../config/env.js";
import { logger } from "../../observability/logger.js";
import { hashEmailForAudit } from "../../utils/cryptoUtils.js";

export interface ResendAdapterOptions {
    apiKey?: string;
    defaultFrom?: string;
    timeoutMs?: number;
    client?: Pick<Resend, "emails">;
}

export class EmailSendError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = "EmailSendError";
    }
}

export class ResendEmailAdapter implements EmailSender {
    private readonly client: Pick<Resend, "emails">;
    private readonly defaultFrom: string;
    private readonly timeoutMs: number;

    constructor(options?: ResendAdapterOptions) {
        const apiKey = options?.apiKey ?? env.RESEND_API_KEY;
        this.defaultFrom = options?.defaultFrom ?? env.EMAIL_FROM;
        this.timeoutMs = options?.timeoutMs ?? env.EMAIL_TIMEOUT_MS;

        if (options?.client) {
            this.client = options.client;
        } else {
            this.client = new Resend(apiKey || "re_dummy_for_init");
        }
    }

    async send(options: SendEmailOptions): Promise<SendEmailResult> {
        const from = options.from || this.defaultFrom;
        const to = Array.isArray(options.to) ? options.to : [options.to];
        const recipientCount = to.length;
        const recipientHash = to.length === 1 ? hashEmailForAudit(to[0]) : undefined;

        const sendPromise = this.client.emails.send({
            from,
            to,
            subject: options.subject,
            html: options.html,
            text: options.text,
        });

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                reject(new EmailSendError(`Email delivery timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
        });

        try {
            const response = await Promise.race([sendPromise, timeoutPromise]);
            if (timer) clearTimeout(timer);

            if (response.error) {
                logger.error("resend.send_failed", {
                    recipientCount,
                    recipientHash,
                    subject: options.subject,
                    errorName: response.error.name,
                });
                throw new EmailSendError("Resend API returned an error", response.error);
            }

            const messageId = response.data?.id;
            logger.info("resend.sent", {
                recipientCount,
                recipientHash,
                subject: options.subject,
                messageId,
            });

            return {
                id: messageId,
                success: true,
            };
        } catch (error: unknown) {
            if (timer) clearTimeout(timer);
            if (error instanceof EmailSendError) {
                throw error;
            }

            const errorName = error instanceof Error ? error.name : "UnknownError";
            logger.error("resend.exception", {
                recipientCount,
                recipientHash,
                subject: options.subject,
                errorName,
            });
            throw new EmailSendError("Failed to send email", error);
        }
    }
}
