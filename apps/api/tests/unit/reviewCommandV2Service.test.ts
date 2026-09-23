import { describe, expect, it, vi } from "vitest";
import { ReviewCommandV2Service } from "../../src/modules/review/application/review-command-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const customer: V2AccessContext = {
    accountId: "1", customerId: "42", employeeId: null, grants: [],
};

describe("ReviewCommandV2Service", () => {
    it("uses the DB-derived customer and normalizes the review input", async () => {
        const create = vi.fn().mockResolvedValue({ kind: "created", reviewId: "9" });
        const service = new ReviewCommandV2Service({ repository: { create } });
        const forgedInput = { productId: "0007", rating: 5, comment: "  Hàng tốt  ", customerId: "999" };
        await expect(service.create(customer, forgedInput))
            .resolves.toEqual({ kind: "created", reviewId: "9" });
        expect(create).toHaveBeenCalledWith("42", "7", 5, "Hàng tốt");
    });

    it("rejects missing customer, invalid ID, rating and comment before persistence", async () => {
        const create = vi.fn();
        const service = new ReviewCommandV2Service({ repository: { create } });
        await expect(service.create({ ...customer, customerId: null }, {
            productId: "7", rating: 5, comment: "Tốt",
        })).resolves.toEqual({ kind: "customer_profile_required" });
        for (const input of [
            { productId: 7, rating: 5, comment: "Tốt" },
            { productId: "0", rating: 5, comment: "Tốt" },
            { productId: "7", rating: 0, comment: "Tốt" },
            { productId: "7", rating: 6, comment: "Tốt" },
            { productId: "7", rating: 4.5, comment: "Tốt" },
            { productId: "7", rating: 5, comment: "   " },
            { productId: "7", rating: 5, comment: "x".repeat(2001) },
        ]) {
            await expect(service.create(customer, input)).resolves.toEqual({ kind: "invalid_review" });
        }
        expect(create).not.toHaveBeenCalled();
    });

    it("passes through safe business results and hides persistence failures", async () => {
        const create = vi.fn()
            .mockResolvedValueOnce({ kind: "product_not_found" })
            .mockResolvedValueOnce({ kind: "already_reviewed" })
            .mockRejectedValueOnce(new Error("SQL details"));
        const service = new ReviewCommandV2Service({ repository: { create } });
        const input = { productId: "7", rating: 5, comment: "Tốt" };
        await expect(service.create(customer, input)).resolves.toEqual({ kind: "product_not_found" });
        await expect(service.create(customer, input)).resolves.toEqual({ kind: "already_reviewed" });
        await expect(service.create(customer, input)).resolves.toEqual({ kind: "review_unavailable" });
    });
});
