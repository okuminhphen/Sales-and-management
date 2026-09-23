import { describe, expect, it } from "vitest";
import {
    signV2AccessToken,
    verifyV2AccessToken,
} from "../../src/security/v2-access-token.js";
import {
    canAccessCustomer,
    canAccessBranch,
    type V2AccessContext,
} from "../../src/modules/identity-access/application/access-context.js";

const customerContext: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{
        roleCode: "CUSTOMER",
        scope: { type: "global" },
        permissions: ["cart.manage.own", "order.read.own"],
    }],
};

describe("V2 access tokens and authorization helpers", () => {
    it("preserves BIGINT identities and scoped role claims without converting them to numbers", () => {
        const token = signV2AccessToken({
            version: 2,
            accountId: "9007199254740993",
            customerId: "9007199254740994",
            employeeId: null,
            roleGrants: [
                { roleCode: "CUSTOMER", scope: { type: "global" } },
                { roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "9007199254740995" } },
            ],
        });

        expect(verifyV2AccessToken(token)).toEqual({
            version: 2,
            accountId: "9007199254740993",
            customerId: "9007199254740994",
            employeeId: null,
            roleGrants: [
                { roleCode: "CUSTOMER", scope: { type: "global" } },
                { roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "9007199254740995" } },
            ],
        });
    });

    it("rejects numeric identity claims before signing", () => {
        expect(() => signV2AccessToken({
            version: 2,
            accountId: 9007199254740993,
            customerId: null,
            employeeId: null,
            roleGrants: [{ roleCode: "CUSTOMER", scope: { type: "global" } }],
        } as never)).toThrow();
    });

    it("keeps CUSTOMER global ownership separate from branch authorization", () => {
        expect(canAccessCustomer(customerContext, "9007199254740994")).toBe(true);
        expect(canAccessCustomer(customerContext, "9007199254740995")).toBe(false);
        expect(canAccessBranch(customerContext, "9007199254740995", "order.read.branch")).toBe(false);
    });

    it("allows a branch-scoped grant only for its branch and matching permission", () => {
        const context: V2AccessContext = {
            accountId: "9007199254740993",
            customerId: null,
            employeeId: "9007199254740994",
            grants: [{
                roleCode: "BRANCH_MANAGER",
                scope: { type: "branch", branchId: "9007199254740995" },
                permissions: ["order.read.branch"],
            }],
        };

        expect(canAccessBranch(context, "9007199254740995", "order.read.branch")).toBe(true);
        expect(canAccessBranch(context, "9007199254740996", "order.read.branch")).toBe(false);
        expect(canAccessBranch(context, "9007199254740995", "order.manage.branch")).toBe(false);
        expect(canAccessBranch({
            ...context,
            grants: [{
                ...context.grants[0]!,
                permissions: ["order.read.global"],
            }],
        }, "9007199254740995", "order.read.global")).toBe(false);
    });
});
