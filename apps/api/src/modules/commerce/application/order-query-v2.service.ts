import {
    canAccessBranch, hasGlobalPermission, hasPermission, type V2AccessContext,
} from "../../identity-access/application/access-context.js";
import {
    serializeEntityId, type EntityId, type Money,
} from "../../../shared/contracts/database-scalars.js";

export type OrderReadScope = { customerId: EntityId | null; branchIds: readonly EntityId[] | null };
export type ShipmentSummary = {
    id: EntityId; provider: string; status: "pending" | "booked" | "shipping" | "delivered"
        | "failed" | "returning" | "returned" | "cancelled";
    trackingNumber: string | null; codAmount: Money;
    shippedAt: string | null; deliveredAt: string | null; returnedAt: string | null;
};
export type OrderSummary = {
    id: EntityId; code: string; customerId: EntityId | null; fulfillmentBranchId: EntityId;
    channel: "online" | "in_store"; fulfillmentType: "delivery" | "store_pickup" | "carry_out";
    fulfillmentStatus: string; status: string; subtotalAmount: Money; discountAmount: Money;
    shippingFee: Money; totalAmount: Money; customerName: string | null;
    customerEmail: string | null; customerPhone: string | null; placedAt: string;
    shipment: ShipmentSummary | null;
    items: readonly { id: EntityId; productId: EntityId | null; skuSnapshot: string;
        productNameSnapshot: string; sizeNameSnapshot: string; imageSnapshot: unknown | null;
        quantity: number; unitPrice: Money;
        discountAmount: Money; lineTotal: Money }[];
};
export type OrderPage = { orders: readonly OrderSummary[]; page: number; limit: number; totalItems: number };
export interface OrderQueryV2Repository {
    list: (scope: OrderReadScope, page: number, limit: number) => Promise<OrderPage>;
    detail: (id: EntityId, scope: OrderReadScope) => Promise<OrderSummary | null>;
}
export type OrderListV2Result = { kind: "orders"; page: OrderPage }
    | { kind: "forbidden" | "invalid_order" | "order_unavailable" };
export type OrderDetailV2Result = { kind: "order"; order: OrderSummary }
    | { kind: "forbidden" | "invalid_order" | "order_not_found" | "order_unavailable" };

const pageIsValid = (page: number, limit: number): boolean =>
    Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(limit)
    && limit > 0 && limit <= 100 && Number.isSafeInteger((page - 1) * limit);

/** Read access is based on current DB grants; a CUSTOMER global role never grants all orders. */
export class OrderQueryV2Service {
    constructor(private readonly dependencies: { repository: OrderQueryV2Repository }) {}

    async listOwn(context: V2AccessContext, page: number, limit: number): Promise<OrderListV2Result> {
        if (!pageIsValid(page, limit)) return { kind: "invalid_order" };
        if (!context.customerId || !hasPermission(context, "order.read.own")) return { kind: "forbidden" };
        return this.list({ customerId: serializeEntityId(context.customerId), branchIds: [] }, page, limit);
    }

    async listBranch(context: V2AccessContext, branchIdInput: unknown,
        page: number, limit: number): Promise<OrderListV2Result> {
        if (!pageIsValid(page, limit)) return { kind: "invalid_order" };
        let branchId: EntityId;
        try { branchId = serializeEntityId(branchIdInput); } catch { return { kind: "invalid_order" }; }
        if (!hasGlobalPermission(context, "order.read.global")
            && !canAccessBranch(context, branchId, "order.read.branch")) return { kind: "forbidden" };
        return this.list({ customerId: null, branchIds: [branchId] }, page, limit);
    }

    async listAll(context: V2AccessContext, page: number, limit: number): Promise<OrderListV2Result> {
        if (!pageIsValid(page, limit)) return { kind: "invalid_order" };
        if (!hasGlobalPermission(context, "order.read.global")) return { kind: "forbidden" };
        return this.list({ customerId: null, branchIds: null }, page, limit);
    }

    async detail(context: V2AccessContext, idInput: unknown): Promise<OrderDetailV2Result> {
        let id: EntityId;
        try { id = serializeEntityId(idInput); } catch { return { kind: "invalid_order" }; }
        const scope = this.visibleScope(context);
        if (scope.customerId === null && scope.branchIds?.length === 0) return { kind: "forbidden" };
        try {
            const order = await this.dependencies.repository.detail(id, scope);
            return order ? { kind: "order", order } : { kind: "order_not_found" };
        } catch { return { kind: "order_unavailable" }; }
    }

    private visibleScope(context: V2AccessContext): OrderReadScope {
        if (hasGlobalPermission(context, "order.read.global")) return { customerId: null, branchIds: null };
        const customerId = context.customerId && hasPermission(context, "order.read.own")
            ? serializeEntityId(context.customerId) : null;
        const branchIds = new Set<EntityId>();
        for (const grant of context.grants) {
            if (grant.roleCode === "CUSTOMER" || grant.scope.type !== "branch"
                || !grant.permissions.includes("order.read.branch")) continue;
            try { branchIds.add(serializeEntityId(grant.scope.branchId)); } catch { /* Invalid grants are ignored. */ }
        }
        return { customerId, branchIds: [...branchIds] };
    }

    private async list(scope: OrderReadScope, page: number, limit: number): Promise<OrderListV2Result> {
        try { return { kind: "orders", page: await this.dependencies.repository.list(scope, page, limit) }; }
        catch { return { kind: "order_unavailable" }; }
    }
}
