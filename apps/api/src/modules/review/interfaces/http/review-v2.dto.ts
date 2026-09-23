import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/).refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
);
const legacyBodyId = z.union([
    entityId,
    z.number().int().positive().safe().transform(String),
]);

export const reviewProductParamsV2 = z.object({ productId: entityId });
export const reviewCreateBodyV2 = z.object({
    productId: legacyBodyId,
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
});
export const reviewListQueryV2 = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
