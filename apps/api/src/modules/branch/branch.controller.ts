import branchService from "./branch.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";

// Lấy danh sách chi nhánh (có thể phân trang)
const readFunc = async (req, res) => {
    try {
        if (req.query.page && req.query.limit) {
            let page = +req.query.page;
            let limit = +req.query.limit;
            let data = await branchService.getBranchesWithPagination(
                page,
                limit
            );
            return res.status(200).json({
                EM: data.EM,
                EC: data.EC,
                DT: data.DT,
            });
        } else {
            let data = await branchService.getAllBranches();
            return res.status(200).json({
                EM: data.EM,
                EC: data.EC,
                DT: data.DT,
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Lỗi server",
            EC: "-1",
            DT: "",
        });
    }
};

// Tạo chi nhánh mới
const createFunc = async (req, res) => {
    try {
        let branchData = req.body;
        let data = await branchService.createNewBranch(branchData);

        // Xóa cache liên quan đến branches
        await clearCacheByPattern("branch:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Lỗi server",
            EC: "-1",
            DT: "",
        });
    }
};

// Cập nhật chi nhánh
const updateFunc = async (req, res) => {
    try {
        let branchId = req.params.branchId;
        let branchData = req.body;
        let data = await branchService.updateBranchById(branchId, branchData);

        // Xóa cache liên quan đến branches
        await clearCacheByPattern("branch:*");
        if (branchId) {
            await clearCacheByPattern(`branch:${branchId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Lỗi server",
            EC: "-1",
            DT: "",
        });
    }
};

// Xóa chi nhánh
const deleteFunc = async (req, res) => {
    try {
        let branchId = req.params.branchId;
        let data = await branchService.deleteBranchById(branchId);

        // Xóa cache liên quan đến branches
        await clearCacheByPattern("branch:*");
        if (branchId) {
            await clearCacheByPattern(`branch:${branchId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Lỗi server",
            EC: "-1",
            DT: "",
        });
    }
};

const getDetailFunc = async (req, res) => {
    try {
        const { branchId } = req.params;
        const branch = await branchService.getBranchDetail(branchId);

        if (!branch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        return res.status(200).json(branch);
    } catch (error) {
        console.error("Error fetching branch detail:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export default {
    readFunc,
    createFunc,
    updateFunc,
    deleteFunc,
    getDetailFunc,
};
