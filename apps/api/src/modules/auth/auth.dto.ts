import { z } from "zod";

const password = z.string().min(8).max(128);

export const registerBody = z.object({
    email: z.string().trim().email(),
    phone: z.string().trim().min(8).max(20),
    username: z.string().trim().min(3).max(100),
    password,
});

export const loginBody = z.object({
    emailOrPhone: z.string().trim().min(3).max(255),
    password: z.string().min(1).max(128),
});

export const adminLoginBody = z.object({
    username: z.string().trim().min(3).max(100),
    password: z.string().min(1).max(128),
});

export const emailBody = z.object({ email: z.string().trim().email() });
export const verifyOtpBody = emailBody.extend({ otp: z.string().trim().regex(/^\d{4,8}$/) });
export const googleLoginBody = z.object({
    credential: z.object({ access_token: z.string().min(1) }),
});
export const captchaBody = z.object({ recaptchaToken: z.string().min(1) });

export type RegisterDto = z.infer<typeof registerBody>;
export type LoginDto = z.infer<typeof loginBody>;
