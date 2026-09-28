import { z } from "zod";
import { v2EntityId as entityId } from "../../../../shared/contracts/v2-entity-id.dto.js";

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
    recaptchaToken: z.string().trim().min(1).max(4096).optional(),
}).strict();
export const backofficeLoginV2Body = z.object({
    username: z.string().trim().min(3).max(255),
    password: z.string().min(1).max(128),
}).strict();

export const ownCustomerParamsV2 = z.object({ id: entityId }).strict();
export const ownCustomerUpdateParamsV2 = z.object({ userId: entityId }).strict();
export const ownCustomerPatchV2 = z.object({
    username: z.string().trim().min(3).max(100).optional(),
    fullname: z.string().trim().min(1).max(255).optional(),
    phone: z.string().trim().min(8).max(30).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
export const ownPasswordChangeV2 = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
    confirmPassword: z.string().min(8).max(128).optional(),
}).strict().superRefine((value, context) => {
    if (value.confirmPassword !== undefined && value.confirmPassword !== value.newPassword) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
    }
    if (value.currentPassword === value.newPassword) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["newPassword"], message: "New password must be different." });
    }
});
