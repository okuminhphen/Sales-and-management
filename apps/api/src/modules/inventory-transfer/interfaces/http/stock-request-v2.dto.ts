import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);
const item = z.object({
    productSizeId: entityId,
    quantity: z.number().int().min(1).max(2_147_483_647),
    note: z.string().max(500).nullable().optional(),
}).strict();
const items = z.array(item).min(1).max(100)
    .refine((value) => new Set(value.map((entry) => entry.productSizeId)).size === value.length,
        "Duplicate productSizeId");

export const stockRequestV2Params = z.object({ id: entityId }).strict();
export const stockRequestV2BranchParams = z.object({ branchId: entityId }).strict();
export const stockRequestV2PageQuery = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const stockRequestV2CreateBody = z.object({
    fromBranchId: entityId,
    toBranchId: entityId,
    items,
}).strict().refine((value) => value.fromBranchId !== value.toBranchId,
    "Requesting and supplying branches must differ");
export const stockRequestV2UpdateBody = z.object({
    toBranchId: entityId.optional(),
    items: items.optional(),
}).strict().refine((value) => value.toBranchId !== undefined || value.items !== undefined,
    "At least one field is required");
export const stockRequestV2RejectBody = z.object({
    note: z.string().trim().min(1).max(500),
}).strict();
