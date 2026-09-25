import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/, "Must be a positive decimal entity ID.").pipe(z.string().refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
    "Entity ID is outside the signed MySQL BIGINT range.",
));

/**
 * Money, payment state and customer ownership are intentionally absent. The
 * use case derives them from the catalog, payment flow and V2 access context.
 */
export const onlinePickupCheckoutBodyV2 = z.object({
    checkoutKey: z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/, "Invalid idempotency key."),
    branchId: entityId,
    recipientName: z.string().trim().min(1).max(255),
    recipientPhone: z.string().trim().min(1).max(30),
    voucherCode: z.string().regex(/^[A-Za-z0-9_-]{1,50}$/, "Invalid voucher code.").nullable(),
    items: z.array(z.object({
        variantId: entityId,
        quantity: z.number().int().min(1).max(2_147_483_647),
    }).strict()).min(1).max(100),
}).strict();
