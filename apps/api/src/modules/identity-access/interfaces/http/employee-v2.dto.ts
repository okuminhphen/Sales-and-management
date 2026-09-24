import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,19}$/)
    .refine((value) => BigInt(value) <= 18446744073709551615n);
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const date = z.string().datetime().transform((value) => new Date(value)).nullable();
const money = z.string().regex(/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/).nullable();
export const employeeV2Params = z.object({ employeeId: entityId }).strict();
export const employeeBranchV2Params = z.object({ branchId: entityId }).strict();
export const employeeV2Query = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();
export const createEmployeeV2Body = z.object({
    branchId: entityId,
    accountId: entityId.nullable().optional(),
    code: z.string().regex(/^[A-Z][A-Z0-9_-]{2,49}$/),
    fullName: z.string().trim().min(1).max(255),
    position: nullableText(150).optional(),
    phone: nullableText(30).optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    salary: money.optional(),
    hiredAt: date.optional(),
}).strict();
export const updateEmployeeV2Body = createEmployeeV2Body.omit({ branchId: true, accountId: true,
    code: true }).partial().strict().refine((body) => Object.keys(body).length > 0);
export const linkEmployeeAccountV2Body = z.object({ accountId: entityId.nullable() }).strict();
export const transferEmployeeV2Body = z.object({ branchId: entityId }).strict();
