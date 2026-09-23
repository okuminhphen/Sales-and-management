import { z } from "zod";

export const createOtpChallengeBody = z.object({
    email: z.string().trim().email(),
    recaptchaToken: z.string().trim().min(1).max(4096).optional(),
});

export const verifyOtpParams = z.object({
    challengeId: z.string().uuid(),
});

export const verifyOtpPayload = z.object({
    otp: z.string().trim().regex(/^\d{6}$/, "Mã OTP phải gồm 6 chữ số"),
});

export type CreateOtpChallengeDto = z.infer<typeof createOtpChallengeBody>;
export type VerifyOtpParamsDto = z.infer<typeof verifyOtpParams>;
export type VerifyOtpPayloadDto = z.infer<typeof verifyOtpPayload>;
