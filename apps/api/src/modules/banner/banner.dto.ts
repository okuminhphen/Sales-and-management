import { z } from "zod";

export const bannerIdParams = z.object({ bannerId: z.coerce.number().int().positive() });
export const bannerBody = z.object({
    name: z.string().trim().min(1).max(255),
    url: z.string().trim().max(2048).optional(),
    status: z.enum(["active", "inactive"]).optional(),
}).passthrough();
export const updateBannerBody = bannerBody.partial();
export type BannerDto = z.infer<typeof bannerBody>;
