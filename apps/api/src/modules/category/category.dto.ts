import { z } from "zod";

export const categoryIdParams = z.object({ categoryId: z.coerce.number().int().positive() });
export const createCategoryBody = z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional(),
}).passthrough();
export const updateCategoryBody = createCategoryBody.partial();
export type CreateCategoryDto = z.infer<typeof createCategoryBody>;
