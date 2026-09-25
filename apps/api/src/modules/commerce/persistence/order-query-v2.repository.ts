import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId, serializeMoney, type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import type {
    OrderPage, OrderQueryV2Repository, OrderReadScope, OrderSummary,
} from "../application/order-query-v2.service.js";

type OrderRow = {
    id: unknown; code: string; customerId: unknown | null; fulfillmentBranchId: unknown;
    channel: string; fulfillmentType: string; fulfillmentStatus: string; status: string;
    subtotalAmount: string; discountAmount: string; shippingFee: string; totalAmount: string;
    customerName: string | null; customerEmail: string | null; customerPhone: string | null;
    placedAt: Date | string;
};
type ItemRow = {
    id: unknown; orderId: unknown; skuSnapshot: string; productNameSnapshot: string;
    sizeNameSnapshot: string; quantity: number; unitPrice: string;
    discountAmount: string; lineTotal: string;
};

const timestamp = (value: Date | string): string => new Date(value).toISOString();

/** Scope stays in the SQL WHERE clause, before LIMIT/OFFSET or detail lookup. */
export class SequelizeOrderQueryV2Repository implements OrderQueryV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async list(scope: OrderReadScope, page: number, limit: number): Promise<OrderPage> {
        const filter = this.filter(scope);
        const count = (await this.persistence.sequelize.query<{ totalItems: unknown }>(
            `SELECT COUNT(*) AS totalItems FROM orders o WHERE ${filter.clause}`,
            { replacements: filter.values, type: QueryTypes.SELECT },
        ))[0];
        const totalItems = Number(count?.totalItems);
        if (!Number.isSafeInteger(totalItems) || totalItems < 0) throw new Error("Invalid order count.");
        const rows = await this.orderRows(
            `${filter.clause} ORDER BY o.placed_at DESC, o.id DESC LIMIT ? OFFSET ?`,
            [...filter.values, limit, (page - 1) * limit],
        );
        return { orders: await this.attachItems(rows), page, limit, totalItems };
    }

    async detail(id: EntityId, scope: OrderReadScope): Promise<OrderSummary | null> {
        const filter = this.filter(scope);
        const rows = await this.orderRows(`o.id = ? AND ${filter.clause} LIMIT 1`, [id, ...filter.values]);
        return (await this.attachItems(rows))[0] ?? null;
    }

    private filter(scope: OrderReadScope): { clause: string; values: EntityId[] } {
        if (scope.branchIds === null) return { clause: "1 = 1", values: [] };
        const branches = scope.branchIds;
        const clauses: string[] = [];
        const values: EntityId[] = [];
        if (scope.customerId !== null) {
            clauses.push("o.customer_id = ?");
            values.push(scope.customerId);
        }
        if (branches.length > 0) {
            clauses.push(`o.fulfillment_branch_id IN (${branches.map(() => "?").join(", ")})`);
            values.push(...branches);
        }
        return { clause: clauses.length > 0 ? `(${clauses.join(" OR ")})` : "1 = 0", values };
    }

    private orderRows(whereAndTail: string, replacements: readonly unknown[]): Promise<OrderRow[]> {
        return this.persistence.sequelize.query<OrderRow>(
            `SELECT o.id, o.code, o.customer_id AS customerId,
                    o.fulfillment_branch_id AS fulfillmentBranchId, o.channel,
                    o.fulfillment_type AS fulfillmentType,
                    o.fulfillment_status AS fulfillmentStatus, o.status,
                    o.subtotal_amount AS subtotalAmount, o.discount_amount AS discountAmount,
                    o.shipping_fee AS shippingFee, o.total_amount AS totalAmount,
                    o.customer_name AS customerName, o.customer_email AS customerEmail,
                    o.customer_phone AS customerPhone, o.placed_at AS placedAt
             FROM orders o WHERE ${whereAndTail}`,
            { replacements: [...replacements], type: QueryTypes.SELECT },
        );
    }

    private async attachItems(rows: readonly OrderRow[]): Promise<OrderSummary[]> {
        if (rows.length === 0) return [];
        const orderIds = rows.map((row) => serializeDatabaseEntityId(row.id));
        const items = await this.persistence.sequelize.query<ItemRow>(
            `SELECT id, order_id AS orderId, sku_snapshot AS skuSnapshot,
                    product_name_snapshot AS productNameSnapshot,
                    size_name_snapshot AS sizeNameSnapshot, quantity,
                    unit_price AS unitPrice, discount_amount AS discountAmount,
                    line_total AS lineTotal FROM order_items
             WHERE order_id IN (${orderIds.map(() => "?").join(", ")}) ORDER BY id ASC`,
            { replacements: orderIds, type: QueryTypes.SELECT },
        );
        const itemsByOrder = new Map<EntityId, OrderSummary["items"][number][]>();
        for (const item of items) {
            const orderId = serializeDatabaseEntityId(item.orderId);
            const values = itemsByOrder.get(orderId) ?? [];
            values.push({ id: serializeDatabaseEntityId(item.id), skuSnapshot: item.skuSnapshot,
                productNameSnapshot: item.productNameSnapshot, sizeNameSnapshot: item.sizeNameSnapshot,
                quantity: item.quantity, unitPrice: serializeMoney(item.unitPrice),
                discountAmount: serializeMoney(item.discountAmount), lineTotal: serializeMoney(item.lineTotal) });
            itemsByOrder.set(orderId, values);
        }
        return rows.map((row) => {
            if (row.channel !== "online" && row.channel !== "in_store") throw new Error("Invalid order channel.");
            if (row.fulfillmentType !== "delivery" && row.fulfillmentType !== "store_pickup"
                && row.fulfillmentType !== "carry_out") throw new Error("Invalid order fulfillment type.");
            const id = serializeDatabaseEntityId(row.id);
            return { id, code: row.code,
                customerId: row.customerId === null ? null : serializeDatabaseEntityId(row.customerId),
                fulfillmentBranchId: serializeDatabaseEntityId(row.fulfillmentBranchId),
                channel: row.channel, fulfillmentType: row.fulfillmentType,
                fulfillmentStatus: row.fulfillmentStatus, status: row.status,
                subtotalAmount: serializeMoney(row.subtotalAmount),
                discountAmount: serializeMoney(row.discountAmount),
                shippingFee: serializeMoney(row.shippingFee), totalAmount: serializeMoney(row.totalAmount),
                customerName: row.customerName, customerEmail: row.customerEmail,
                customerPhone: row.customerPhone, placedAt: timestamp(row.placedAt),
                items: itemsByOrder.get(id) ?? [] };
        });
    }
}
