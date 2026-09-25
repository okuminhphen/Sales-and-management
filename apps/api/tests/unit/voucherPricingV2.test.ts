import { describe, expect, it } from "vitest";
import { calculateVoucherDiscountV2 } from "../../src/modules/commerce/application/voucher-pricing-v2.js";

describe("V2 voucher pricing", () => {
    it("caps a fixed discount at the merchandise subtotal", () => {
        expect(calculateVoucherDiscountV2({
            subtotal: "80.0000", discountType: "fixed", discountValue: "100.0000", maxDiscountAmount: null,
        })).toBe("80.0000");
    });

    it("rounds percent discounts to VND without floating-point arithmetic", () => {
        expect(calculateVoucherDiscountV2({
            subtotal: "999.0000", discountType: "percent", discountValue: "12.5000", maxDiscountAmount: null,
        })).toBe("125.0000");
    });

    it("applies the maximum discount before returning whole VND", () => {
        expect(calculateVoucherDiscountV2({
            subtotal: "1000.0000", discountType: "percent", discountValue: "50.0000", maxDiscountAmount: "120.0000",
        })).toBe("120.0000");
    });

    it("never discounts more than a fractional subtotal or cap", () => {
        expect(calculateVoucherDiscountV2({
            subtotal: "99.5000", discountType: "fixed", discountValue: "100.0000", maxDiscountAmount: "99.5000",
        })).toBe("99.0000");
    });
});
