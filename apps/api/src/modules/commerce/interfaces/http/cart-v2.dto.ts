import { z } from "zod";

const stringId = z.string().regex(/^[1-9]\d{0,18}$/).refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
);
// Existing browser code sends safe JS numbers; V2 database IDs remain strings end-to-end.
export const cartEntityIdV2 = z.union([
    stringId,
    z.number().int().positive().safe().transform(String),
]);
const quantity = z.number().int().min(1).max(2_147_483_647);

export const cartReadParamsV2 = z.object({ userId: cartEntityIdV2 });
export const cartReadQueryV2 = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
});
export const cartDeleteParamsV2 = z.object({ cartProductSizeId: cartEntityIdV2 });
export const cartAddBodyV2 = z.object({
    id: cartEntityIdV2,
    sizeId: cartEntityIdV2,
    quantity,
});
export const cartUpdateBodyV2 = z.object({
    cartProductSizeId: cartEntityIdV2,
    quantity,
});
