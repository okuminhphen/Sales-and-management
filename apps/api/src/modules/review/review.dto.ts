import { z } from "zod";

const productId = z.coerce.number().int().positive();
export const productIdParams = z.object({ productId });
export const addReviewBody = z.object({
    productId,
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
});
export type AddReviewDto = z.infer<typeof addReviewBody>;
