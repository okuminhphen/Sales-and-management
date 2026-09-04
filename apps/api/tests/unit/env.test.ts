import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv", () => {
    it("applies safe local defaults", () => {
        const result = parseEnv({ NODE_ENV: "test" });

        expect(result.API_PORT).toBe(8080);
        expect(result.MYSQL_DATABASE).toBe("btl_tmdt");
        expect(result.AI_SERVICE_URL).toBe("http://localhost:8000");
        expect(result.VNP_URL).toContain("sandbox.vnpayment.vn");
    });

    it("rejects the development JWT secret in production", () => {
        expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(
            /JWT_SECRET must be set in production/
        );
    });

    it("rejects missing VNPay credentials in production", () => {
        expect(() =>
            parseEnv({ NODE_ENV: "production", JWT_SECRET: "a-secure-production-secret" })
        ).toThrow(/VNPay credentials must be set in production/);
    });

    it("rejects an unsigned payment webhook configuration in production", () => {
        expect(() =>
            parseEnv({
                NODE_ENV: "production",
                JWT_SECRET: "a-secure-production-secret",
                VNP_TMN_CODE: "merchant",
                VNP_HASH_SECRET: "payment-secret",
            })
        ).toThrow(/PAYMENT_WEBHOOK_SECRET must be set in production/);
    });
});
