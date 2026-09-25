import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/, "Must be a positive decimal entity ID.").pipe(z.string().refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
    "Entity ID is outside the signed MySQL BIGINT range.",
));

const canonicalIsoTimestamp = z.string().refine((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}, "Must be a canonical UTC ISO timestamp.");

export const notificationReadParamsV2 = z.object({ notificationId: entityId }).strict();
export const notificationListQueryV2 = z.object({
    beforeCreatedAt: canonicalIsoTimestamp.optional(),
    beforeId: entityId.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict().refine(
    (value) => (value.beforeCreatedAt === undefined) === (value.beforeId === undefined),
    { message: "Pagination cursor requires both beforeCreatedAt and beforeId.", path: ["beforeId"] },
);
export const notificationReadBodyV2 = z.object({}).strict().default({});
