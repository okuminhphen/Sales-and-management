import { z } from "zod";

const password = z.string().min(8).max(128);
export const registerV2Body = z.object({
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(8).max(30),
    username: z.string().trim().min(3).max(100),
    password,
    emailVerificationToken: z.string().uuid(),
}).strict();
export const customerLoginV2Body = z.object({
    emailOrPhone: z.string().trim().min(3).max(255),
    password: z.string().min(1).max(128),
}).strict();
export const backofficeLoginV2Body = z.object({
    username: z.string().trim().min(3).max(255),
    password: z.string().min(1).max(128),
}).strict();

const entityId = z.string().regex(/^[1-9]\d{0,19}$/).pipe(z.string().refine((value) => BigInt(value) <= 18446744073709551615n));
export const ownCustomerParamsV2 = z.object({ id: entityId }).strict();
export const ownCustomerUpdateParamsV2 = z.object({ userId: entityId }).strict();
export const ownCustomerPatchV2 = z.object({
    username: z.string().trim().min(3).max(100).optional(),
    fullname: z.string().trim().min(1).max(255).optional(),
    phone: z.string().trim().min(8).max(30).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
