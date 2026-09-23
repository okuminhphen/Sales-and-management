import type { EmailSender, SendEmailOptions, SendEmailResult } from "./email-sender.port.js";
import { logger } from "../../observability/logger.js";
import { hashEmailForAudit } from "../../utils/cryptoUtils.js";

export class TestEmailAdapter implements EmailSender {
    public sentEmails: SendEmailOptions[] = [];

    async send(options: SendEmailOptions): Promise<SendEmailResult> {
        this.sentEmails.push({ ...options });
        const toStr = Array.isArray(options.to) ? options.to.join(",") : options.to;
        logger.info("mail.test_provider_sent", {
            recipientHash: hashEmailForAudit(toStr),
            subject: options.subject,
        });
        return {
            id: `test-email-${Date.now()}-${this.sentEmails.length}`,
            success: true,
        };
    }

    clear(): void {
        this.sentEmails = [];
    }

    getLastEmail(): SendEmailOptions | undefined {
        return this.sentEmails[this.sentEmails.length - 1];
    }
}
