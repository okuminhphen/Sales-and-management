import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .pipe(z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n));

export const catalogListQueryV2 = z.object({
    page: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const catalogProductIdParamsV2 = z.object({ productId: entityId });
