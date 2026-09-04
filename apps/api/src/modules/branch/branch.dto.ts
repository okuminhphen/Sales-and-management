import { z } from "zod";

export const branchIdParams = z.object({ branchId: z.coerce.number().int().positive() });
export const branchQuery = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const createBranchBody = z.object({
    name: z.string().trim().min(1).max(255),
    address: z.string().trim().min(1).max(1000),
    phone: z.string().trim().min(8).max(20).optional(),
    email: z.string().trim().email().optional(),
    type: z.string().trim().min(1).max(50).optional(),
    managerId: z.coerce.number().int().positive().optional(),
}).passthrough();
export const updateBranchBody = createBranchBody.partial();
export type CreateBranchDto = z.infer<typeof createBranchBody>;
