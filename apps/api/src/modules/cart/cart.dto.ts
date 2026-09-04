import { z } from "zod";

const positiveId = z.coerce.number().int().positive();
const quantity = z.coerce.number().int().positive();

export const userIdParams = z.object({ userId: positiveId });
export const cartItemIdParams = z.object({ cartProductSizeId: positiveId });

export const addCartItemBody = z.object({
    id: positiveId,
    sizeId: positiveId,
    quantity,
});

export const updateCartItemBody = z.object({
    cartProductSizeId: positiveId,
    quantity,
});

export type AddCartItemDto = z.infer<typeof addCartItemBody>;
export type UpdateCartItemDto = z.infer<typeof updateCartItemBody>;
