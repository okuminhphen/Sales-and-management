import { describe, expect, it } from "vitest";
import { OrderQueryV2Service, type OrderQueryV2Repository } from "../../src/modules/commerce/application/order-query-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";

const customer: V2AccessContext = {
    accountId: "1", customerId: "10", employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: ["order.read.own", "order.read.global"] }],
};
const staff: V2AccessContext = {
    accountId: "2", customerId: null, employeeId: "5",
    grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "20" }, permissions: ["order.read.branch"] }],
};

describe("V2 order query authorization", () => {
    const scopes: unknown[] = [];
    const repository: OrderQueryV2Repository = {
        list: async (scope, page, limit) => {
            scopes.push(scope);
            return { orders: [], page, limit, totalItems: 0 };
        },
        detail: async (_id, scope) => {
            scopes.push(scope);
            return null;
        },
    };
    const service = new OrderQueryV2Service({ repository });

    it("scopes customer reads to the DB-derived customer ID despite a GLOBAL customer grant", async () => {
        scopes.length = 0;
        expect((await service.listOwn(customer, 1, 20)).kind).toBe("orders");
        expect(scopes).toEqual([{ customerId: "10", branchIds: [] }]);
        expect((await service.listAll(customer, 1, 20)).kind).toBe("forbidden");
        expect(await service.detail(customer, "11")).toEqual({ kind: "order_not_found" });
        expect(scopes.at(-1)).toEqual({ customerId: "10", branchIds: [] });
    });

    it("limits staff to its currently granted branch and rejects unsafe IDs", async () => {
        scopes.length = 0;
        expect((await service.listBranch(staff, "20", 1, 20)).kind).toBe("orders");
        expect(scopes).toEqual([{ customerId: null, branchIds: ["20"] }]);
        expect((await service.listBranch(staff, "21", 1, 20)).kind).toBe("forbidden");
        expect((await service.detail(staff, 9007199254740993)).kind).toBe("invalid_order");
    });

    it("allows only an internal global order grant to request the global scope", async () => {
        scopes.length = 0;
        const admin: V2AccessContext = {
            accountId: "3", customerId: null, employeeId: null,
            grants: [{ roleCode: "SUPER_ADMIN", scope: { type: "global" }, permissions: ["order.read.global"] }],
        };
        expect((await service.listAll(admin, 1, 10)).kind).toBe("orders");
        expect(scopes).toEqual([{ customerId: null, branchIds: null }]);
        expect((await service.detail(admin, "11")).kind).toBe("order_not_found");
        expect(scopes.at(-1)).toEqual({ customerId: null, branchIds: null });
    });
});
