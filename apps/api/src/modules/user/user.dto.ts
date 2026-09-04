import { z } from "zod";

const id = z.coerce.number().int().positive();
const email = z.string().trim().email();
const phone = z.string().trim().min(8).max(20);
const password = z.string().min(8).max(128);

export const userIdParams = z.object({ userId: id });
export const userLookupParams = z.object({ id });
export const userListQuery = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createUserBody = z.object({
    username: z.string().trim().min(2).max(80),
    email,
    phone,
    password,
    roleId: id,
});
export type CreateUserDto = z.infer<typeof createUserBody>;

export const updateProfileBody = z.object({
    username: z.string().trim().min(2).max(80).optional(),
    email: email.optional(),
    phone: phone.optional(),
    fullname: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(255).optional(),
}).refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "At least one profile field is required",
});
export type UpdateProfileDto = z.infer<typeof updateProfileBody>;

export const updatePasswordBody = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
    confirmPassword: z.string().optional(),
}).refine(
    (body) => !body.confirmPassword || body.confirmPassword === body.newPassword,
    { path: ["confirmPassword"], message: "Passwords do not match" },
);
export type UpdatePasswordDto = z.infer<typeof updatePasswordBody>;

export const updateUserByAdminBody = createUserBody.extend({
    password: z.union([password, z.literal("")]).optional(),
});
export type UpdateUserByAdminDto = z.infer<typeof updateUserByAdminBody>;
