import { describe, expect, it } from "vitest";
import { allocateOrderDiscountV2 } from "../../src/modules/commerce/application/order-pricing-v2.js";

describe("V2 order discount allocation", () => {
    it("allocates a whole-VND discount proportionally with deterministic residual", () => {
        expect(allocateOrderDiscountV2([
            { unitPrice: "100.0000", quantity: 1 },
            { unitPrice: "200.0000", quantity: 1 },
            { unitPrice: "300.0000", quantity: 1 },
        ], "101.0000")).toEqual({
            subtotalAmount: "600.0000", discountAmount: "101.0000", totalAmount: "499.0000",
            lines: [
                { discountAmount: "17.0000", lineTotal: "83.0000" },
                { discountAmount: "34.0000", lineTotal: "166.0000" },
                { discountAmount: "50.0000", lineTotal: "250.0000" },
            ],
        });
    });

    it("breaks equal remainders by input order and never exceeds a line", () => {
        expect(allocateOrderDiscountV2([
            { unitPrice: "1.0000", quantity: 1 },
            { unitPrice: "1.0000", quantity: 1 },
        ], "1.0000").lines).toEqual([
            { discountAmount: "1.0000", lineTotal: "0.0000" },
            { discountAmount: "0.0000", lineTotal: "1.0000" },
        ]);
    });

    it("handles a full discount and multiple quantities", () => {
        expect(allocateOrderDiscountV2([
            { unitPrice: "100.0000", quantity: 2 },
            { unitPrice: "50.0000", quantity: 1 },
        ], "250.0000")).toEqual({
            subtotalAmount: "250.0000", discountAmount: "250.0000", totalAmount: "0.0000",
            lines: [
                { discountAmount: "200.0000", lineTotal: "0.0000" },
                { discountAmount: "50.0000", lineTotal: "0.0000" },
            ],
        });
    });

    it("keeps high-value DECIMAL arithmetic exact beyond JavaScript safe integers", () => {
        expect(allocateOrderDiscountV2([
            { unitPrice: "9007199254740.0000", quantity: 1 },
            { unitPrice: "1.0000", quantity: 1 },
        ], "1.0000")).toEqual({
            subtotalAmount: "9007199254741.0000", discountAmount: "1.0000",
            totalAmount: "9007199254740.0000",
            lines: [
                { discountAmount: "1.0000", lineTotal: "9007199254739.0000" },
                { discountAmount: "0.0000", lineTotal: "1.0000" },
            ],
        });
    });

    it("permits free merchandise only when its discount is zero", () => {
        expect(allocateOrderDiscountV2([{ unitPrice: "0.0000", quantity: 2 }], "0.0000")
            .lines).toEqual([{ discountAmount: "0.0000", lineTotal: "0.0000" }]);
    });

    it("rejects fractional VND, invalid quantities, over-discount, and DECIMAL overflow", () => {
        expect(() => allocateOrderDiscountV2([{ unitPrice: "1.5000", quantity: 1 }], "0.0000")).toThrow();
        expect(() => allocateOrderDiscountV2([{ unitPrice: "1.0000", quantity: 0 }], "0.0000")).toThrow();
        expect(() => allocateOrderDiscountV2([{ unitPrice: "1.0000", quantity: 1 }], "2.0000")).toThrow();
        expect(() => allocateOrderDiscountV2([{ unitPrice: "999999999999999.0000", quantity: 2 }], "0.0000")).toThrow();
    });
});
