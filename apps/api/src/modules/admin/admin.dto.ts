import { z } from "zod";

export const adminIdParams = z.object({ adminId: z.coerce.number().int().positive() });
export const adminQuery = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const createAdminBody = z.object({
    email: z.string().trim().email(),
    username: z.string().trim().min(3).max(100),
    password: z.string().min(8).max(128),
    fullname: z.string().trim().min(1).max(255).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    roleId: z.coerce.number().int().positive().optional(),
    branchId: z.coerce.number().int().positive().optional(),
}).passthrough();
export const updateAdminBody = createAdminBody.partial();
export type CreateAdminDto = z.infer<typeof createAdminBody>;
