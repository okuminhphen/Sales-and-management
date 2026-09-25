import { z } from "zod";
import { v2EntityId as entityId } from "../../../../shared/contracts/v2-entity-id.dto.js";

const nullablePhone = z.string().trim().min(1).max(30).nullable();
const nullableEmail = z.string().trim().email().max(255).nullable();
export const branchV2Params = z.object({ branchId: entityId }).strict();
export const branchV2Query = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();
export const createBranchV2Body = z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_-]{2,49}$/),
    name: z.string().trim().min(1).max(255),
    address: z.string().trim().min(1).max(500),
    phone: nullablePhone.optional(),
    email: nullableEmail.optional(),
    type: z.enum(["central", "branch"]).optional(),
}).strict();
export const updateBranchV2Body = createBranchV2Body.omit({ code: true }).partial().strict()
    .refine((body) => Object.keys(body).length > 0);
export const assignBranchManagerV2Body = z.object({ employeeId: entityId.nullable() }).strict();
