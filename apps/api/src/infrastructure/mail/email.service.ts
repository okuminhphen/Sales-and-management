import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import mustache from "mustache";

// SMTP and template rendering are infrastructure concerns, not a feature service.

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

/**
 * Gửi email dựa vào loại người nhận
 * @param {string} to - email người nhận
 * @param {string} subject - tiêu đề email
 * @param {string} templateName - tên file template
 * @param {object} variables - dữ liệu render
 * @param {"admin" | "user"} type - loại template
 */
export const sendEmailTemplate = async (
    to,
    subject,
    templateName,
    variables,
    type = "user"
) => {
    try {
        const templateFolder =
            type === "admin" ? "adminTemplate" : "customerTemplate";

        const templatePath = path.join(
            process.cwd(),
            "templates",
            templateFolder,
            `${templateName}.html`
        );

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`);
        }

        const template = fs.readFileSync(templatePath, "utf-8");
        const html = mustache.render(template, variables);

        await transporter.sendMail({
            from: `"HappyShop" <${EMAIL_USER}>`,
            to,
            subject,
            html,
        });

        console.log(
            `Email sent to ${to} using template: ${templateFolder}/${templateName}.html`
        );
    } catch (error) {
        console.error("Error sending email:", error);
    }
};
