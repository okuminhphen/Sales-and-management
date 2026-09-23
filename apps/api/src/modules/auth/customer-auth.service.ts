import db from "../../models/index.js";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import { sendEmailTemplate } from "../../infrastructure/mail/email.service.js";
import { otpService } from "./otp/otp.service.js";
import { logger } from "../../observability/logger.js";
import { hashEmailForAudit } from "../../utils/cryptoUtils.js";

const salt = bcrypt.genSaltSync(10);
const hashUserPassword = (userPassword: string): string => {
    return bcrypt.hashSync(userPassword, salt);
};

const checkEmailExist = async (userEmail: string): Promise<boolean> => {
    const user = await db.User.findOne({ where: { email: userEmail } });
    return !!user;
};

const checkPassword = (inputPassword: string, hashPassword: string): boolean => {
    return bcrypt.compareSync(inputPassword, hashPassword);
};

interface RegisterUserInput {
    email: string;
    phone: string;
    username: string;
    password: string;
    emailVerificationToken: string;
}

const registerNewUser = async (rawUserData: RegisterUserInput) => {
    const token = rawUserData.emailVerificationToken;
    const email = rawUserData.email ? String(rawUserData.email).trim().toLowerCase() : "";

    // 1. Atomically claim verification token for this email (Required 3)
    const claimResult = await otpService.claimVerificationToken(token, email);
    if (!claimResult.success) {
        if (claimResult.error === "EMAIL_MISMATCH") {
            return {
                EM: "Email xác thực không khớp với tài khoản đăng ký",
                EC: 1,
            };
        }
        if (claimResult.error === "ALREADY_CLAIMED") {
            return {
                EM: "Yêu cầu đăng ký đang được xử lý, vui lòng chờ",
                EC: 1,
            };
        }
        return {
            EM: "Mã xác thực email không hợp lệ hoặc đã hết hạn",
            EC: 1,
        };
    }

    try {
        const isEmailExist = await checkEmailExist(email);
        if (isEmailExist) {
            // Release token so user can change email or retry
            await otpService.releaseVerificationToken(token);
            return {
                EM: "The email is already exist",
                EC: 1,
            };
        }

        const customerRole = await db.Role.findOne({
            where: { name: "customer" },
        });
        if (!customerRole) {
            await otpService.releaseVerificationToken(token);
            return { EM: "Role 'customer' not found", EC: 1, DT: [] };
        }

        const hashPassword = hashUserPassword(rawUserData.password);

        // Transactional user creation
        const transaction = await db.sequelize.transaction();
        let newUser: any;
        try {
            newUser = await db.User.create(
                {
                    email,
                    phone: rawUserData.phone,
                    username: rawUserData.username,
                    password: hashPassword,
                },
                { transaction }
            );

            await db.UserRole.create(
                {
                    userId: newUser.id,
                    roleId: customerRole.id,
                },
                { transaction }
            );

            await transaction.commit();
        } catch (txError) {
            await transaction.rollback();
            // Release token back to READY so user can retry after database error
            await otpService.releaseVerificationToken(token);
            throw txError;
        }

        // ── POST-COMMIT: DB is the source of truth from here ──
        // Finalize (consume) token best-effort. If Redis is down, the token
        // will expire via TTL anyway; we must NOT report failure to the client.
        try {
            const finalized = await otpService.finalizeVerificationToken(token);
            if (!finalized) {
                logger.warn("registration.finalize_token_incomplete", {
                    emailHash: hashEmailForAudit(email),
                });
            }
        } catch (finalizeError) {
            // Best-effort: log safely and continue — user is already created
            const emailHash = hashEmailForAudit(email);
            logger.warn("registration.finalize_token_failed", {
                emailHash,
                errorName: finalizeError instanceof Error ? finalizeError.name : "UnknownError",
            });
        }

        // Gửi email chào mừng không kèm raw password
        try {
            await sendEmailTemplate(
                newUser.email,
                "Tài khoản mới",
                "newCus",
                {
                    fullname: newUser.fullname || newUser.username,
                    email: newUser.email,
                    username: newUser.username,
                },
                "user"
            );
        } catch {
            // Don't fail registration if welcome email delivery fails
        }

        return {
            EM: "A user is created  successfully",
            EC: 0,
        };
    } catch (e) {
        // Only reached for pre-commit errors (email check, role check, DB transaction)
        try {
            await otpService.releaseVerificationToken(token);
        } catch {
            // Best-effort release; token will expire via TTL
        }
        const emailHash = hashEmailForAudit(email);
        logger.error("registration.service_error", {
            emailHash,
            errorName: e instanceof Error ? e.name : "UnknownError",
        });
        return {
            EM: "Something wrongs in service...",
            EC: -2,
        };
    }
};

const handleUserLogin = async (rawUserData: any) => {
    try {
        const user = await db.User.findOne({
            where: {
                [Op.or]: [
                    { email: rawUserData.emailOrPhone },
                    { phone: rawUserData.emailOrPhone },
                ],
            },
            include: [
                {
                    model: db.Role,
                    through: { attributes: [] },
                    as: "userRole",
                    attributes: ["id", "name"],
                },
            ],
        });

        if (!user) {
            return {
                EM: "Your email/phone number or password is incorrect",
                EC: 1,
                DT: "",
            };
        }

        if (!checkPassword(rawUserData.password, user.password)) {
            return {
                EM: "Your email/phone number or password is incorrect",
                EC: 1,
                DT: "",
            };
        }

        const role = user.userRole.length > 0 ? user.userRole[0] : null;
        return {
            EM: "Login success",
            EC: 0,
            DT: {
                userId: user.id,
                email: user.email,
                userRole: role,
                branchId: user.branchId,
            },
        };
    } catch (e) {
        console.error(e);
        return {
            EM: "Something wrongs in service...",
            EC: -2,
        };
    }
};

const handleGoogleLoginOrRegister = async (rawUserData: any) => {
    try {
        const { id, email, name, given_name } = rawUserData;
        let user = await db.User.findOne({
            where: { email },
            include: [
                {
                    model: db.Role,
                    through: { attributes: [] },
                    as: "userRole",
                    attributes: ["id", "name"],
                },
            ],
        });

        if (!user) {
            user = await db.User.create({
                email,
                username: given_name,
                fullname: name,
                googleId: id,
            });
            await db.UserRole.create({
                userId: user.id,
                roleId: 1,
            });

            await sendEmailTemplate(
                user.email,
                "Tài khoản Google mới",
                "newCus",
                {
                    fullname: name,
                    email: user.email,
                    username: given_name,
                },
                "user"
            );

            user = await db.User.findOne({
                where: { id: user.id },
                include: [
                    {
                        model: db.Role,
                        through: { attributes: [] },
                        as: "userRole",
                        attributes: ["id", "name"],
                    },
                ],
            });
        }

        return {
            EM: "Login success",
            EC: 0,
            DT: {
                userId: user.id,
                email: user.email,
                userRole: user.userRole,
                branchId: user.branchId,
            },
        };
    } catch (e) {
        console.error(e);
        return {
            EM: "Something wrongs in service...",
            EC: -2,
        };
    }
};

export default {
    registerNewUser,
    handleUserLogin,
    handleGoogleLoginOrRegister,
};
