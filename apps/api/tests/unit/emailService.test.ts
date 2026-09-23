import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    EmailSendError,
    ResendEmailAdapter,
    TestEmailAdapter,
    setEmailSender,
    sendEmailTemplate,
} from "../../src/infrastructure/mail/index.js";

describe("Email Infrastructure", () => {
    describe("ResendEmailAdapter", () => {
        it("sends email successfully via Resend SDK", async () => {
            const mockSend = vi.fn().mockResolvedValue({
                data: { id: "msg_resend_123" },
                error: null,
            });

            const adapter = new ResendEmailAdapter({
                apiKey: "re_mock_key",
                defaultFrom: "HappyShop <test@happyshop.vn>",
                client: { emails: { send: mockSend } as any },
            });

            const result = await adapter.send({
                to: "recipient@example.com",
                subject: "Xin chào",
                html: "<p>Nội dung</p>",
            });

            expect(result.success).toBe(true);
            expect(result.id).toBe("msg_resend_123");
            expect(mockSend).toHaveBeenCalledWith({
                from: "HappyShop <test@happyshop.vn>",
                to: ["recipient@example.com"],
                subject: "Xin chào",
                html: "<p>Nội dung</p>",
                text: undefined,
            });
        });

        it("throws EmailSendError when Resend returns an error", async () => {
            const mockSend = vi.fn().mockResolvedValue({
                data: null,
                error: {
                    message: "Domain not verified",
                    name: "validation_error",
                },
            });

            const adapter = new ResendEmailAdapter({
                apiKey: "re_mock_key",
                client: { emails: { send: mockSend } as any },
            });

            await expect(
                adapter.send({
                    to: "recipient@example.com",
                    subject: "Test",
                    html: "<p>Test</p>",
                })
            ).rejects.toThrow(EmailSendError);
        });

        it("times out if Resend does not respond within timeoutMs", async () => {
            const hangingSend = vi.fn().mockImplementation(
                () => new Promise((resolve) => setTimeout(resolve, 200))
            );

            const adapter = new ResendEmailAdapter({
                apiKey: "re_mock_key",
                timeoutMs: 50,
                client: { emails: { send: hangingSend } as any },
            });

            await expect(
                adapter.send({
                    to: "recipient@example.com",
                    subject: "Timeout Test",
                    html: "<p>Timeout</p>",
                })
            ).rejects.toThrow(/timed out/);
        });
    });

    describe("sendEmailTemplate facade", () => {
        let testSender: TestEmailAdapter;

        beforeEach(() => {
            testSender = new TestEmailAdapter();
            setEmailSender(testSender);
        });

        afterEach(() => {
            setEmailSender(undefined);
        });

        it("renders template and sends email via current EmailSender", async () => {
            await sendEmailTemplate(
                "customer@example.com",
                "Chào mừng",
                "newCus",
                {
                    fullname: "Nguyễn Văn A",
                    email: "customer@example.com",
                    username: "nguyenvana",
                    loginUrl: "http://localhost:3000/login",
                },
                "user"
            );

            expect(testSender.sentEmails).toHaveLength(1);
            const sent = testSender.sentEmails[0];
            expect(sent.to).toBe("customer@example.com");
            expect(sent.subject).toBe("Chào mừng");
            expect(sent.html).toContain("Nguyễn Văn A");
            expect(sent.html).toContain("nguyenvana");
        });
    });
});
