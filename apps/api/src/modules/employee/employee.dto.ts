import { z } from "zod";

const id = z.coerce.number().int().positive();
export const employeeIdParams = z.object({ employeeId: id });
export const branchIdParams = z.object({ branchId: id });
export const employeeBody = z.object({
    adminId: id.optional(),
    branchId: id,
    name: z.string().trim().min(1).max(255),
    position: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(8).max(20).optional(),
    email: z.string().trim().email().optional(),
    salary: z.coerce.number().nonnegative().optional(),
    status: z.string().trim().min(1).max(50).optional(),
    hiredAt: z.coerce.date().optional(),
}).passthrough();
export const updateEmployeeBody = employeeBody.partial();
export type EmployeeDto = z.infer<typeof employeeBody>;
