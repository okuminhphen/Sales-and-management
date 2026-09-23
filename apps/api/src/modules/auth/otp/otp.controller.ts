import type { Request, Response } from "express";
import { otpService } from "./otp.service.js";

export class OtpController {
    constructor(private readonly service = otpService) {}

    handleCreateChallenge = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { email } = req.body;
            const result = await this.service.createVerificationChallenge(email);

            if (!result.success) {
                if (result.error === "COOLDOWN_ACTIVE") {
                    return res.status(429).json({
                        EM: "Vui lòng đợi trước khi yêu cầu mã mới",
                        EC: 1,
                        DT: { retryAfterSeconds: result.retryAfterSeconds },
                    });
                }

                return res.status(503).json({
                    EM: result.message,
                    EC: -1,
                    DT: null,
                });
            }

            return res.status(202).json({
                EM: "Nếu địa chỉ hợp lệ, mã xác thực đã được gửi",
                EC: 0,
                DT: result.data,
            });
        } catch (error) {
            return res.status(500).json({
                EM: "Internal server error",
                EC: -1,
                DT: null,
            });
        }
    };

    handleVerifyChallenge = async (req: Request, res: Response): Promise<Response> => {
        try {
            const challengeId = req.params.challengeId as string;
            const { otp } = req.body;

            const result = await this.service.verifyChallenge(challengeId, otp);

            if (!result.success) {
                if (result.error === "TOO_MANY_ATTEMPTS") {
                    return res.status(429).json({
                        EM: "Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.",
                        EC: 1,
                        DT: null,
                    });
                }

                if (result.error === "INVALID_CODE") {
                    return res.status(400).json({
                        EM: `Mã xác thực không đúng. Bạn còn ${result.attemptsRemaining} lần thử.`,
                        EC: 1,
                        DT: { attemptsRemaining: result.attemptsRemaining },
                    });
                }

                return res.status(400).json({
                    EM: "Mã xác thực không hợp lệ hoặc đã hết hạn",
                    EC: 1,
                    DT: null,
                });
            }

            return res.status(200).json({
                EM: "Xác minh email thành công",
                EC: 0,
                DT: {
                    verificationToken: result.verificationToken,
                    expiresInSeconds: result.expiresInSeconds,
                },
            });
        } catch (error) {
            return res.status(500).json({
                EM: "Internal server error",
                EC: -1,
                DT: null,
            });
        }
    };
}

export const otpController = new OtpController();
