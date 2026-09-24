import { z } from "zod";

const roleId = z.coerce.number().int().positive().max(2147483647);
const permissionCodes = z.array(z.string().regex(/^[a-z][a-z0-9_.]{2,149}$/)).min(1).max(100)
    .refine((codes) => new Set(codes).size === codes.length);
export const roleIdV2Params = z.object({ roleId }).strict();
export const createRoleV2Body = z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,99}$/),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    permissionCodes,
}).strict();
export const updateRoleV2Body = createRoleV2Body.omit({ code: true }).partial().strict()
    .refine((body) => Object.keys(body).length > 0);
