import { z } from "zod";

export const productIdParams = z.object({
    productId: z.coerce.number().int().positive(),
});
