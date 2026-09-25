import { z } from "zod";
import type { EntityId, Money } from "../../../../shared/contracts/database-scalars.js";

/** Transitional legacy-envelope payload; payment/shipment fields join at T34/T35. */
export type OrderReadDtoV2 = {
    id: EntityId; code: string; customerId: EntityId | null; branchId: EntityId;
    channel: "online" | "in_store"; fulfillmentType: "delivery" | "store_pickup" | "carry_out";
    fulfillmentStatus: string; orderDate: string; totalPrice: Money;
    subtotalAmount: Money; discountAmount: Money; shippingFee: Money;
    status: string; customerName: string | null; customerEmail: string | null;
    customerPhone: string | null;
    shipment: {
        id: EntityId; provider: string; status: string; trackingNumber: string | null;
        codAmount: Money; shippedAt: string | null; deliveredAt: string | null; returnedAt: string | null;
    } | null;
    ordersDetails: readonly {
        id: EntityId; orderId: EntityId; productId: EntityId | null; skuSnapshot: string;
        productName: string; productSize: string; quantity: number;
        productImage: unknown | null; priceAtOrder: Money; discountAmount: Money; totalPrice: Money;
    }[];
};

const entityId = z.string().regex(/^[1-9]\d{0,18}$/).refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
);

export const orderReadUserParamsV2 = z.object({ userId: entityId });
export const orderReadBranchParamsV2 = z.object({ branchId: entityId });
export const orderReadDetailParamsV2 = z.object({ orderId: entityId });
export const orderReadListQueryV2 = z.object({
    page: z.coerce.number().int().positive().safe().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
});
