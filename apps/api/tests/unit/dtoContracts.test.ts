import { describe, expect, it } from "vitest";
import { registerBody } from "../../src/modules/auth/auth.dto.js";
import { createProductBody } from "../../src/modules/product/product.dto.js";
import { createStockRequestBody } from "../../src/modules/stock-request/stock-request.dto.js";

describe("request DTO contracts", () => {
    it("rejects weak registration payloads", () => {
        const result = registerBody.safeParse({
            email: "not-an-email",
            phone: "123",
            username: "ab",
            password: "short",
        });

        expect(result.success).toBe(false);
    });

    it("requires emailVerificationToken in registration payload", () => {
        const withoutToken = registerBody.safeParse({
            email: "valid@example.com",
            phone: "0123456789",
            username: "validuser",
            password: "validpassword123",
        });
        const withNonUuidToken = registerBody.safeParse({
            email: "valid@example.com",
            phone: "0123456789",
            username: "validuser",
            password: "validpassword123",
            emailVerificationToken: "valid-one-time-token",
        });
        expect(withNonUuidToken.success).toBe(false);

        const withUuidToken = registerBody.safeParse({
            email: "valid@example.com",
            phone: "0123456789",
            username: "validuser",
            password: "validpassword123",
            emailVerificationToken: "123e4567-e89b-12d3-a456-426614174000",
        });
        expect(withUuidToken.success).toBe(true);
    });

    it("coerces multipart product numbers into typed values", () => {
        const result = createProductBody.parse({
            name: "Clean Architecture",
            price: "199000",
            categoryId: "2",
        });

        expect(result.price).toBe(199000);
        expect(result.categoryId).toBe(2);
    });

    it("requires at least one valid stock request item", () => {
        expect(() => createStockRequestBody.parse({ toBranchId: 2, items: [] })).toThrow();
        expect(createStockRequestBody.parse({
            toBranchId: "2",
            items: [{ productSizeId: "7", quantity: "3" }],
        })).toMatchObject({
            toBranchId: 2,
            items: [{ productSizeId: 7, quantity: 3 }],
        });
    });
});
