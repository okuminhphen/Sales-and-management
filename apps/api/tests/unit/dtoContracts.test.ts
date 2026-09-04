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
