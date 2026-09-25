import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/, "Must be a positive decimal entity ID.").pipe(z.string().refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
    "Entity ID is outside the signed MySQL BIGINT range.",
));

export const orderLifecycleParamsV2 = z.object({ orderId: entityId }).strict();
export const confirmOrderBodyV2 = z.object({}).strict().default({});
export const cancelOrderBodyV2 = z.object({
    reason: z.string().trim().min(1).max(500),
}).strict();
