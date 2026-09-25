import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);
const quantity = z.number().int().min(0).max(2_147_483_647);
const item = z.object({
    itemId: entityId, receivedQuantity: quantity,
    lostQuantity: quantity, nonSellableQuantity: quantity,
}).strict();
const items = z.array(item).min(1).max(100)
    .refine((value) => new Set(value.map((entry) => entry.itemId)).size === value.length,
        "Duplicate transfer item ID");
const note = z.string().trim().min(1).max(500);

export const transferV2Params = z.object({ id: entityId }).strict();
export const transferV2PageQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const transferV2ReceiveBody = z.object({ items }).strict()
    .refine((value) => value.items.every((entry) => entry.lostQuantity === 0
        && entry.nonSellableQuantity === 0 && entry.receivedQuantity > 0),
    "Full receipt cannot include loss or damaged items");
export const transferV2DiscrepancyBody = z.object({ items, note }).strict()
    .refine((value) => value.items.some((entry) => entry.lostQuantity > 0
        || entry.nonSellableQuantity > 0), "A discrepancy is required");
export const transferV2NoteBody = z.object({ note }).strict();
export const transferV2RejectBody = z.object({ reason: note }).strict();
