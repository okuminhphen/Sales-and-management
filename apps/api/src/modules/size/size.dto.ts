import { z } from "zod";

export const createSizeBody = z.object({
    name: z.string().trim().min(1).max(100),
});
export const updateSizeBody = createSizeBody.extend({
    id: z.coerce.number().int().positive(),
});
export const sizeIdParams = z.object({ id: z.coerce.number().int().positive() });

export type CreateSizeDto = z.infer<typeof createSizeBody>;
export type UpdateSizeDto = z.infer<typeof updateSizeBody>;
