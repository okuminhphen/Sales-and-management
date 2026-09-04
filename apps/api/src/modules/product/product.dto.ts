import { z } from "zod";

const id = z.coerce.number().int().positive();

export const productIdParams = z.object({ id });
export const recommendProductIdParams = z.object({ productId: id });
export const deleteProductBody = z.object({ id });
export const categoryProductQuery = z.object({ categoryId: id });
export const recommendForUserQuery = z.object({
    userId: id.optional(),
    num: z.coerce.number().int().min(1).max(100).optional(),
});

export const createProductBody = z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional(),
    price: z.coerce.number().finite().nonnegative(),
    categoryId: id,
}).passthrough();

export const updateProductBody = createProductBody.partial();
export type CreateProductDto = z.infer<typeof createProductBody>;
export type UpdateProductDto = z.infer<typeof updateProductBody>;
