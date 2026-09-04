import { z } from "zod";

export const voucherIdParams = z.object({ voucherId: z.coerce.number().int().positive() });
export const voucherBody = z.object({
    code: z.string().trim().min(1).max(100),
    description: z.string().max(1000).optional(),
    discount_type: z.enum(["percent", "fixed"]),
    discount_value: z.coerce.number().positive(),
    min_order_value: z.coerce.number().nonnegative().optional(),
    quantity: z.coerce.number().int().nonnegative(),
    expires_at: z.coerce.date(),
}).passthrough();
export const updateVoucherBody = voucherBody.partial();
export const checkVoucherBody = z.object({ code: z.string().trim().min(1).max(100) }).passthrough();
export type VoucherDto = z.infer<typeof voucherBody>;
