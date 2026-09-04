import { z } from "zod";

const positiveId = z.coerce.number().int().positive();
const quantity = z.coerce.number().int().positive();
const money = z.coerce.number().finite().positive();

export const userIdParams = z.object({ userId: positiveId });
export const branchIdParams = z.object({ branchId: positiveId });
export const orderIdParams = z.object({ orderId: positiveId });

export const orderStatus = z.enum([
    "PENDING",
    "CONFIRMED",
    "SHIPPING",
    "COMPLETED",
    "CANCELLED",
]);

export const updateOrderStatusBody = z.object({ status: orderStatus });
export const updateOrderBody = updateOrderStatusBody.extend({ id: positiveId });
export const deleteOrderBody = z.object({ id: positiveId });

const orderItem = z.object({
    id: positiveId.optional(),
    productId: positiveId.optional(),
    name: z.string().trim().min(1).optional(),
    images: z.union([z.string(), z.array(z.unknown())]).optional(),
    size: z.string().trim().min(1),
    quantity,
    price: money,
}).refine((item) => item.id !== undefined || item.productId !== undefined, {
    message: "id or productId is required",
});

const customerInfo = z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().min(8).max(20),
    email: z.string().email().or(z.literal("")),
    address: z.string().trim().min(1),
    message: z.string().max(1000).optional(),
    provinceId: positiveId,
    districtId: positiveId,
    wardId: z.string().trim().min(1),
}).passthrough();

export const createOrderBody = z.object({
    cartItems: z.array(orderItem).min(1),
    customerInfo,
    totalPrice: money,
    paymentMethodId: positiveId,
    branchId: positiveId.optional(),
});

export const createInStoreOrderBody = createOrderBody.extend({
    branchId: positiveId,
    customerInfo: customerInfo.partial().optional(),
});

export type CreateOrderDto = z.infer<typeof createOrderBody>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusBody>;
