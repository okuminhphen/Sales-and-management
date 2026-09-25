import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { OrderQueryV2Service, type OrderSummary } from "../../src/modules/commerce/application/order-query-v2.service.js";
import { createOrderReadV2Router } from "../../src/modules/commerce/interfaces/http/order-read-v2.routes.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";

const own: V2AccessContext = { accountId: "1", customerId: "3", employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: ["order.read.own"] }] };
const staff: V2AccessContext = { accountId: "2", customerId: null, employeeId: "4",
    grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "9" },
        permissions: ["order.read.branch"] }] };
const order: OrderSummary = { id: serializeEntityId("9223372036854775807"), code: "O-1",
    customerId: serializeEntityId("3"), fulfillmentBranchId: serializeEntityId("9"),
    channel: "online", fulfillmentType: "store_pickup",
    fulfillmentStatus: "unfulfilled", status: "pending", subtotalAmount: serializeMoney("100.0000"),
    discountAmount: serializeMoney("10.0000"), shippingFee: serializeMoney("0.0000"),
    totalAmount: serializeMoney("90.0000"),
    customerName: "Nguyen A", customerEmail: null, customerPhone: "0900000000",
    placedAt: "2026-09-25T00:00:00.000Z", items: [{ id: serializeEntityId("12"),
        productId: serializeEntityId("7"), skuSnapshot: "SKU-1", imageSnapshot: ["/snapshot.jpg"],
        productNameSnapshot: "Áo", sizeNameSnapshot: "M", quantity: 1,
        unitPrice: serializeMoney("100.0000"), discountAmount: serializeMoney("10.0000"),
        lineTotal: serializeMoney("90.0000") }] };

const setup = (context: V2AccessContext) => {
    const scopes: unknown[] = [];
    const detailScopes: unknown[] = [];
    const query = new OrderQueryV2Service({ repository: {
        list: async (scope, page, limit) => {
            scopes.push(scope);
            return { orders: [order], page, limit, totalItems: 1 };
        },
        detail: async (id, scope) => {
            detailScopes.push({ id, scope });
            return id === order.id && (scope.customerId === order.customerId
                || scope.branchIds === null || scope.branchIds.includes(order.fulfillmentBranchId)) ? order : null;
        },
    } });
    const app = express();
    app.use("/api/v1", createOrderReadV2Router({ query, auth: (req, _res, next) => {
        (req as V2AuthenticatedRequest).v2AccessContext = context;
        next();
    } }));
    return { app, scopes, detailScopes };
};

describe("Order V2 HTTP read compatibility", () => {
    it("derives customer scope from the authenticated context, not the URL or JWT userId", async () => {
        const { app, scopes } = setup(own);
        const result = await request(app).get("/api/v1/order/read/999?page=1&limit=10");
        expect(result.status).toBe(200);
        expect(scopes).toEqual([{ customerId: "3", branchIds: [] }]);
        expect(result.body).toMatchObject({ EC: 0, DT: [{ id: "9223372036854775807",
            totalPrice: "90.0000", status: "PENDING", branchId: "9",
            ordersDetails: [{ productName: "Áo", priceAtOrder: "100.0000" }] }],
        pagination: { page: 1, limit: 10, totalItems: 1 } });
    });

    it("enforces current branch/global grants before any repository read", async () => {
        const { app, scopes } = setup(staff);
        await request(app).get("/api/v1/order/branch/10").expect(403);
        expect(scopes).toEqual([]);
        await request(app).get("/api/v1/order/branch/9").expect(200);
        expect(scopes).toEqual([{ customerId: null, branchIds: ["9"] }]);
        await request(app).get("/api/v1/order/read").expect(403);
    });

    it("rejects malformed BIGINT and pagination without a query", async () => {
        const { app, scopes } = setup(own);
        await request(app).get("/api/v1/order/read/900719925474099300000").expect(400);
        await request(app).get("/api/v1/order/read/3?page=0").expect(400);
        expect(scopes).toEqual([]);
    });

    it("returns a visible order detail but hides other branch orders as not found", async () => {
        const { app: ownerApp } = setup(own);
        const ownDetail = await request(ownerApp).get(`/api/v1/order/${order.id}`);
        expect(ownDetail.status).toBe(200);
        expect(ownDetail.body).toMatchObject({ EC: 0, DT: { id: order.id,
            ordersDetails: [{ productId: "7", productImage: ["/snapshot.jpg"] }] } });
        const { app: staffApp, detailScopes } = setup({ ...staff,
            grants: [{ roleCode: "BRANCH_MANAGER", scope: { type: "branch", branchId: "10" },
                permissions: ["order.read.branch"] }] });
        await request(staffApp).get(`/api/v1/order/${order.id}`).expect(404);
        expect(detailScopes).toEqual([{ id: order.id, scope: { customerId: null, branchIds: ["10"] } }]);
    });
});
