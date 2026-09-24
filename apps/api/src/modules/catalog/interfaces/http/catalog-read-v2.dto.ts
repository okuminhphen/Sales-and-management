import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .pipe(z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n));

export const catalogListQueryV2 = z.object({
    page: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const catalogProductIdParamsV2 = z.object({ productId: entityId });
export const catalogCategoryIdParamsV2 = z.object({ categoryId: entityId });

export const categoryCreateBodyV2 = z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullable().optional(),
    parentId: entityId.nullable().optional(),
}).strict();
export const categoryUpdateBodyV2 = categoryCreateBodyV2.partial().refine(
    (input) => Object.keys(input).length > 0,
    { message: "At least one field is required" },
);

export const sizeCreateBodyV2 = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const sizeUpdateBodyV2 = sizeCreateBodyV2.extend({ id: entityId });
export const sizeIdParamsV2 = z.object({ id: entityId });

const money = z.string().regex(/^\d+(?:\.\d{1,4})?$/)
    .refine((value) => value.replace(/^0+(?=\d)/, "").split(".")[0]!.length <= 15);
export const productCreateBodyV2 = z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullable().optional(),
    price: money,
    categoryId: entityId,
}).strict();
export const productUpdateBodyV2 = productCreateBodyV2.partial().extend({
    status: z.enum(["draft", "active", "inactive"]).optional(),
}).refine((input) => Object.keys(input).length > 0, { message: "At least one field is required" });
export const productUpdateParamsV2 = z.object({ id: entityId });
export const productDeleteBodyV2 = z.object({ id: entityId }).strict();
