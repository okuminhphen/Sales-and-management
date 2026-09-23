import loginRegisterService from "./customer-auth.service.js";
import { generateToken } from "../../middlewares/authMiddleware.js";
import axios from "axios";
const testApi = (req, res) => {
    return res.status(200).json({
        message: "oke",
        data: "test api",
    });
};

const handleRegister = async (req, res) => {
    try {
        if (!req.body.email || !req.body.phone || !req.body.password || !req.body.emailVerificationToken) {
            return res.status(200).json({
                EM: "Missing required parameters", // error message
                EC: "1", //error code
                DT: "", // Date
            });
        }

        if (req.body.password && req.body.password.length < 4) {
            return res.status(200).json({
                EM: "Your password must have more than 3 letters", // error message
                EC: "1", //error code
                DT: "", // Date
            });
        }

        // service: create user
        let data = await loginRegisterService.registerNewUser(req.body);

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Date
        });
    } catch (e) {
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const handleLogin = async (req, res) => {
    try {
        let data = await loginRegisterService.handleUserLogin(req.body);

        if (data && data.EC === 0 && typeof data.DT === "object" && data.DT) {
            const user = data.DT as any;
            let payload = {
                userId: user.userId,
                role: user.userRole.name,
                branchId: user.branchId,
            };

            const token = generateToken(payload);

            if (!token) {
                return res.status(401).json({ EM: "invalid token" });
            }
            res.cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "Lax",
                maxAge: 24 * 60 * 60 * 1000,
            });

            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: { token, ...user },
            });
        }
        return res.status(401).json(data);
    } catch (e) {
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const handleGoogleLogin = async (req, res) => {
    try {
        const accessToken = req.body.credential.access_token;
        if (!accessToken) {
            return res.status(400).json({ message: "Thiếu access_token" });
        }

        // Gọi Google API để lấy thông tin người dùng
        const response = await axios.get(
            `https://www.googleapis.com/oauth2/v2/userinfo`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const data = await loginRegisterService.handleGoogleLoginOrRegister(
            response.data
        );

        let payload = {
            userId: data.DT.userId,
            email: data.DT.email,
            role: data.DT.userRole.name,
            branchId: data.DT.branchId,
        };

        const token = generateToken(payload);

        if (!token) {
            return res.status(401).json({ EM: "invalid token" });
        }
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge: 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Date
        });
    } catch (e) {
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const handleLogout = (req, res) => {
    res.clearCookie("token");
    return res.status(200).json({
        EM: "Logout successfully",
        EC: "0",
    });
};

const handleVerifyCaptcha = async (req, res) => {
    const { recaptchaToken } = req.body;
    if (!recaptchaToken) {
        return res.status(400).json({ message: "Missing reCAPTCHA token" });
    }

    try {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        const response = await axios.post(
            "https://www.google.com/recaptcha/api/siteverify",
            new URLSearchParams({
                secret: secretKey,
                response: recaptchaToken,
            }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );
        const { success, score, action } = response.data;

        if (!success) {
            return res
                .status(403)
                .json({ message: "Failed CAPTCHA verification" });
        }

        // Optionally check score or action
        return res.status(200).json({
            EM: "Verify CAPTCHA successfully",
            EC: "0",
            DT: "",
        });
    } catch (err) {
        console.error("Recaptcha verify error:", err);
        return res
            .status(500)
            .json({ message: "Server error in CAPTCHA verification" });
    }
};
export default {
    testApi,
    handleRegister,
    handleLogin,
    handleLogout,
    handleGoogleLogin,
    handleVerifyCaptcha,
};
