import authService from "./admin-auth.service.js";
import { generateToken } from "../../middlewares/authMiddleware.js";

const handleAdminLoginController = async (req: any, res: any) => {
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

        // Set cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge: 24 * 60 * 60 * 1000, // 1 ngày
        });

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
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
    handleAdminLoginController,
};
