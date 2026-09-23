import { Router } from "express";
import { rateLimit } from "../../../middlewares/rateLimit.js";
import { validateRequest } from "../../../middlewares/validateRequest.js";
import { hashEmailForAudit } from "../../../utils/cryptoUtils.js";
import { otpController } from "./otp.controller.js";
import { createOtpChallengeBody, verifyOtpParams, verifyOtpPayload } from "./otp.dto.js";
import { requireOtpRecaptcha } from "./recaptcha.guard.js";

export const createOtpRouter = (): Router => {
    const router = Router();

    router.post(
        "/auth/email-verification/challenges",
        rateLimit({ keyPrefix: "rate-limit:otp-challenge:ip", maxRequests: 5, windowSeconds: 60 }),
        validateRequest({ body: createOtpChallengeBody }),
        requireOtpRecaptcha,
        rateLimit({
            keyPrefix: "rate-limit:otp-challenge:email",
            maxRequests: 3,
            windowSeconds: 60,
            keyGenerator: (req) => hashEmailForAudit(req.body.email),
        }),
        otpController.handleCreateChallenge
    );

    router.post(
        "/auth/email-verification/challenges/:challengeId/verify",
        rateLimit({ keyPrefix: "rate-limit:otp-verify", maxRequests: 10, windowSeconds: 60 }),
        validateRequest({ params: verifyOtpParams, body: verifyOtpPayload }),
        otpController.handleVerifyChallenge
    );

    return router;
};
