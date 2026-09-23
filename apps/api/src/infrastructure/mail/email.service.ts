import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mustache from "mustache";
import { getEmailSender } from "./index.js";
import { logger } from "../../observability/logger.js";
import { hashEmailForAudit } from "../../utils/cryptoUtils.js";

const resolveTemplatePath = (templateFolder: string, templateName: string): string => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.join(process.cwd(), "templates", templateFolder, `${templateName}.html`),
        path.join(process.cwd(), "apps", "api", "templates", templateFolder, `${templateName}.html`),
        path.resolve(currentDir, "../../../templates", templateFolder, `${templateName}.html`),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Template file not found: ${templateFolder}/${templateName}.html`);
};

/**
 * Gửi email dựa vào loại người nhận thông qua EmailSender port
 * @param to - email người nhận
 * @param subject - tiêu đề email
 * @param templateName - tên file template
 * @param variables - dữ liệu render
 * @param type - loại template ("admin" | "user")
 */
export const sendEmailTemplate = async (
    to: string,
    subject: string,
    templateName: string,
    variables: Record<string, unknown>,
    type: "admin" | "user" = "user"
): Promise<void> => {
    try {
        const templateFolder = type === "admin" ? "adminTemplate" : "customerTemplate";
        const templatePath = resolveTemplatePath(templateFolder, templateName);

        const template = fs.readFileSync(templatePath, "utf-8");
        const html = mustache.render(template, variables);

        const sender = getEmailSender();
        await sender.send({
            to,
            subject,
            html,
        });

        const recipientHash = hashEmailForAudit(to);
        logger.info("email_service.template_sent", {
            recipientHash,
            template: `${templateFolder}/${templateName}.html`,
        });
    } catch (error) {
        const recipientHash = hashEmailForAudit(to);
        logger.error("email_service.send_error", {
            recipientHash,
            templateName,
            errorName: error instanceof Error ? error.name : "UnknownError",
        });
    }
};
