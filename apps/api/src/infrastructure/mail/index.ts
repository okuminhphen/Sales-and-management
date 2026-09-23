import { env } from "../../config/env.js";
import type { EmailSender } from "./email-sender.port.js";
import { ResendEmailAdapter } from "./resend-email.adapter.js";
import { TestEmailAdapter } from "./test-email.adapter.js";

export * from "./email-sender.port.js";
export * from "./resend-email.adapter.js";
export * from "./test-email.adapter.js";
export * from "./email.service.js";

let currentSender: EmailSender | undefined;

export const getEmailSender = (): EmailSender => {
    if (!currentSender) {
        if (env.EMAIL_PROVIDER === "test") {
            currentSender = new TestEmailAdapter();
        } else {
            currentSender = new ResendEmailAdapter();
        }
    }
    return currentSender;
};

export const setEmailSender = (sender: EmailSender | undefined): void => {
    currentSender = sender;
};
