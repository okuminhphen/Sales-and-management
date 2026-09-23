import { describe, expect, it, vi } from "vitest";
import {
    GoogleRecaptchaAdapter,
    RecaptchaProviderError,
} from "../../src/infrastructure/recaptcha/google-recaptcha.adapter.js";

const createAdapter = (responseData: unknown) => {
    const post = vi.fn().mockResolvedValue({ data: responseData });
    const adapter = new GoogleRecaptchaAdapter({
        secretKey: "test-secret",
        minimumScore: 0.5,
        allowedHostnames: ["shop.example.com"],
        timeoutMs: 2_000,
        client: { post },
    });
    return { adapter, post };
};

describe("GoogleRecaptchaAdapter", () => {
    it("accepts a valid response matching action, score, and hostname", async () => {
        const { adapter, post } = createAdapter({
            success: true,
            score: 0.9,
            action: "register",
            hostname: "shop.example.com",
        });

        await expect(adapter.verify({
            token: "valid-token",
            expectedAction: "register",
            remoteIp: "127.0.0.1",
        })).resolves.toEqual({ valid: true });

        expect(post).toHaveBeenCalledWith(
            "https://www.google.com/recaptcha/api/siteverify",
            expect.any(String),
            expect.objectContaining({ timeout: 2_000 }),
        );
        const requestBody = String(post.mock.calls[0][1]);
        expect(requestBody).toContain("secret=test-secret");
        expect(requestBody).toContain("response=valid-token");
        expect(requestBody).toContain("remoteip=127.0.0.1");
    });

    it.each([
        ["provider rejection", { success: false }, "INVALID_TOKEN"],
        ["wrong action", { success: true, score: 0.9, action: "login", hostname: "shop.example.com" }, "ACTION_MISMATCH"],
        ["low score", { success: true, score: 0.2, action: "register", hostname: "shop.example.com" }, "SCORE_TOO_LOW"],
        ["wrong hostname", { success: true, score: 0.9, action: "register", hostname: "evil.example.com" }, "HOSTNAME_MISMATCH"],
        ["malformed response", { success: "yes" }, "PROVIDER_RESPONSE_INVALID"],
    ])("rejects %s", async (_caseName, responseData, expectedReason) => {
        const { adapter } = createAdapter(responseData);

        await expect(adapter.verify({
            token: "untrusted-token",
            expectedAction: "register",
        })).resolves.toEqual({ valid: false, reason: expectedReason });
    });

    it("maps network failures to a provider error without exposing the upstream payload", async () => {
        const adapter = new GoogleRecaptchaAdapter({
            secretKey: "test-secret",
            client: { post: vi.fn().mockRejectedValue(new Error("upstream secret payload")) },
        });

        await expect(adapter.verify({
            token: "untrusted-token",
            expectedAction: "register",
        })).rejects.toEqual(new RecaptchaProviderError());
    });
});
