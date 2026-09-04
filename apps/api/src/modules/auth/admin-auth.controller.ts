import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import dotenv from "dotenv";
import authService from "./admin-auth.service.js";
import { generateToken } from "../../middlewares/authMiddleware.js";
dotenv.config();

const otpStore = {};
const email_user = process.env.EMAIL_USER;
const email_pass = process.env.EMAIL_PASS;
const handleSendOTP = async (req, res) => {
    const email = req.body.email;

    if (!email) return res.status(400).json({ message: "Email is required" });
    const otp = otpGenerator.generate(6, {
        digits: true,
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
    });

    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút
    otpStore[email] = { otp, expiresAt };

    // Gửi email
    const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: email_user,
            pass: email_pass, // NOT your normal Gmail password!
        },
    });
    await transporter.sendMail({
        from: '"HappyShop" <leminhphung8282003@email.com>',
        to: email,
        subject: "Mã OTP xác thực đăng nhập",
        html: `<p>Mã OTP của bạn là: <strong>${otp}</strong></p>`,
    });

    res.json({ message: "OTP sent" });
};

const handleVerifyOTPFunc = async (req, res) => {
    console.log(req.body);
    const { email, otp } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !otp) {
        return res.status(400).json({ message: "Email và OTP là bắt buộc" });
    }

    const storedData = otpStore[email];

    // Kiểm tra xem có lưu OTP cho email này không
    if (!storedData) {
        return res
            .status(400)
            .json({ message: "Không tìm thấy mã OTP. Vui lòng yêu cầu lại." });
    }

    // Kiểm tra hết hạn
    if (Date.now() > storedData.expiresAt) {
        delete otpStore[email]; // Xoá để tránh dùng lại
        return res
            .status(400)
            .json({ message: "Mã OTP đã hết hạn. Vui lòng yêu cầu lại." });
    }

    // So sánh OTP
    if (storedData.otp !== otp) {
        return res.status(400).json({ message: "Mã OTP không đúng" });
    }

    // Thành công
    delete otpStore[email]; // OTP chỉ dùng 1 lần
    return res.status(200).json({ message: "Xác thực OTP thành công", EC: 0 });
};

const handleAdminLoginController = async (req, res) => {
    try {
        let data = await authService.handleAdminLoginService(req.body);

        if (data.EC !== 0) {
            return res.status(401).json({
                EM: data.EM,
                EC: data.EC,
                DT: data.DT,
            });
        }

        const admin = data.DT as any;

        // Lấy role an toàn
        const roleName = admin.role ? admin.role.name : null;

        if (!roleName) {
            return res.status(403).json({
                EM: "Admin chưa được gán role",
                EC: 2,
                DT: "",
            });
        }

        const payload = {
            adminId: admin.adminId,
            role: roleName,
            branchId: admin.branchId,
        };

        // Tạo token
        const token = generateToken(payload);

        if (!token) {
            return res.status(401).json({
                EM: "Invalid token",
                EC: 1,
                DT: "",
            });
        }

        // Optionally set cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge: 24 * 60 * 60 * 1000, // 1 ngày
        });

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, // error code
            DT: { token, ...payload },
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({
            EM: "Internal server error",
            EC: "-1",
            DT: "",
        });
    }
};

export default {
    handleVerifyOTPFunc,
    handleSendOTP,
    handleAdminLoginController,
};
