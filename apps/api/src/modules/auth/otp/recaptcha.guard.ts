import type { NextFunction, Request, Response } from "express";
import { env } from "../../../config/env.js";
import { getRecaptchaVerifier } from "../../../infrastructure/recaptcha/index.js";
import { logger } from "../../../observability/logger.js";

let enabledOverride: boolean | undefined;

export const setOtpRecaptchaEnabledOverride = (value: boolean | undefined): void => {
    enabledOverride = value;
};

export const requireOtpRecaptcha = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    const enabled = enabledOverride ?? env.RECAPTCHA_ENABLED;
    if (!enabled) {
        next();
        return;
    }

    const token = request.body.recaptchaToken as string | undefined;
    if (!token) {
        response.status(400).json({
            EM: "Thiếu thông tin xác minh reCAPTCHA",
            EC: 1,
            DT: null,
        });
        return;
    }

    try {
        const result = await getRecaptchaVerifier().verify({
            token,
            expectedAction: "register",
            remoteIp: request.ip,
        });
        if (result.valid === false) {
            logger.warn("otp.recaptcha_rejected", {
                requestId: request.requestId,
                reason: result.reason,
            });
            response.status(403).json({
                EM: "Xác minh reCAPTCHA thất bại",
                EC: 1,
                DT: null,
            });
            return;
        }

        next();
    } catch (error) {
        logger.error("otp.recaptcha_provider_failed", {
            requestId: request.requestId,
            errorName: error instanceof Error ? error.name : "UnknownError",
        });
        response.status(503).json({
            EM: "Không thể xác minh reCAPTCHA vào lúc này",
            EC: -1,
            DT: null,
        });
    }
};
