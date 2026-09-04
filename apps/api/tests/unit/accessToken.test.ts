import { describe, expect, it } from "vitest";
import {
    signAccessToken,
    verifyAccessToken,
} from "../../src/security/access-token.js";

describe("access tokens", () => {
    it("preserves the authenticated admin identity and branch", () => {
        const token = signAccessToken({
            adminId: 7,
            branchId: 3,
            role: "BRANCH_MANAGER",
        });

        expect(verifyAccessToken(token)).toEqual({
            adminId: 7,
            branchId: 3,
            role: "BRANCH_MANAGER",
        });
    });

    it("rejects a subject without a user or admin identity", () => {
        expect(() => signAccessToken({ role: "CUSTOMER" })).toThrow(
            /identify a user or admin/
        );
    });
});
