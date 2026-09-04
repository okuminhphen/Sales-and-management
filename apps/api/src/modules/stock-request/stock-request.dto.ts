import { z } from "zod";

const id = z.coerce.number().int().positive();
export const stockRequestIdParams = z.object({ id });
export const branchIdParams = z.object({ branchId: id });
const item = z.object({
    productSizeId: id,
    quantity: z.coerce.number().int().positive(),
    note: z.string().max(1000).optional(),
});
export const createStockRequestBody = z.object({
    fromBranchId: id.optional(),
    toBranchId: id,
    items: z.array(item).min(1),
}).passthrough();
export const updateStockRequestBody = z.object({
    toBranchId: id.optional(),
    items: z.array(item).min(1).optional(),
}).passthrough();
export const rejectStockRequestBody = z.object({ note: z.string().trim().min(1).max(1000) });
export type CreateStockRequestDto = z.infer<typeof createStockRequestBody>;
