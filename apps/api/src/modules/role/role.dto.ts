import { z } from "zod";

export const roleIdParams = z.object({ roleId: z.coerce.number().int().positive() });
export const roleBody = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(1000).optional(),
}).passthrough();
export const updateRoleBody = roleBody.partial();
export type RoleDto = z.infer<typeof roleBody>;
