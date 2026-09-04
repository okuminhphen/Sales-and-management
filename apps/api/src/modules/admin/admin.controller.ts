import adminService from "./admin.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";

/**
 * Lấy danh sách admin
 * Luồng xử lý:
 * Client → Controller → Service → Model → Database
 */
const readAdmins = async (req, res) => {
    // Lấy tham số từ request (query, params)

    // Gọi service xử lý nghiệp vụ
    const result = await adminService.getAllAdmins();

    // Trả response cho client
    return res.json(result);
};
const readFunc = async (req, res) => {
    try {
        if (req.query.page && req.query.limit) {
            let page = +req.query.page;
            let limit = +req.query.limit;
            console.log(`page= ${page} and limit= ${limit}`);
            let data = await adminService.getAllAdmins(); // tạm dùng getAllAdmins, có thể thêm pagination sau
            return res.status(200).json({
                EM: data.EM,
                EC: data.EC,
                DT: data.DT,
            });
        } else {
            let data = await adminService.getAllAdmins();
            return res.status(200).json({
                EM: data.EM,
                EC: data.EC,
                DT: data.DT,
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: "-1",
            DT: "",
        });
    }
};

const createFunc = async (req, res) => {
    try {
        let adminData = req.body;
        let data = await adminService.createNewAdmin(adminData);

        // Xóa cache liên quan đến admins
        await clearCacheByPattern("admin:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: "-1",
            DT: "",
        });
    }
};

const updateFunc = async (req, res) => {
    try {
        let adminId = req.params.adminId;
        let adminData = req.body;
        let data = await adminService.updateAdminById(adminId, adminData);

        // Xóa cache liên quan đến admins
        await clearCacheByPattern("admin:*");
        if (adminId) {
            await clearCacheByPattern(`admin:${adminId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: "-1",
            DT: "",
        });
    }
};

const deleteFunc = async (req, res) => {
    try {
        let adminId = req.params.adminId;
        let data = await adminService.deleteAdmin(adminId);

        // Xóa cache liên quan đến admins
        await clearCacheByPattern("admin:*");
        if (adminId) {
            await clearCacheByPattern(`admin:${adminId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: "-1",
            DT: "",
        });
    }
};

const getAdminFunc = async (req, res) => {
    try {
        let adminId = req.params.adminId;
        let data = await adminService.getAdminById(adminId);
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "error",
            EC: "-1",
            DT: "",
        });
    }
};

export default {
    readFunc,
    createFunc,
    updateFunc,
    deleteFunc,
    getAdminFunc,
};
