import { z } from "zod";
import { toCatalogPublicTargetUrl } from "../../application/catalog-public-media.js";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/)
    .pipe(z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n));
const metadata = z.object({
    name: z.string().trim().min(1).max(255),
    url: z.string().trim().max(1000)
        .refine((value) => value === "" || toCatalogPublicTargetUrl(value) !== null)
        .nullable().optional(),
    status: z.enum(["draft", "active", "inactive"]).optional(),
}).strict();
const mapMetadata = (input: { name?: string; url?: string | null; status?: "draft" | "active" | "inactive" }) => ({
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.url === undefined ? {} : { targetUrl: input.url || null }),
    ...(input.status === undefined ? {} : { status: input.status }),
});

export const bannerCreateBodyV2 = metadata.transform(mapMetadata);
export const bannerUpdateBodyV2 = metadata.partial().transform(mapMetadata);
export const bannerIdParamsV2 = z.object({ bannerId: entityId });
export const bannerListQueryV2 = z.object({
    page: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
