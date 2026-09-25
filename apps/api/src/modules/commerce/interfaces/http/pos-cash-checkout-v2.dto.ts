import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/, "Must be a positive decimal entity ID.").pipe(z.string().refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
    "Entity ID is outside the signed MySQL BIGINT range.",
));

/**
 * Price, payment method and payment status are intentionally absent: POS cash
 * derives all three from trusted server state inside its atomic transaction.
 */
export const posCashCheckoutBodyV2 = z.object({
    checkoutKey: z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/, "Invalid idempotency key."),
    branchId: entityId,
    items: z.array(z.object({
        variantId: entityId,
        quantity: z.number().int().min(1).max(2_147_483_647),
    }).strict()).min(1).max(100),
}).strict();
