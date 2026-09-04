import stockRequestService from "./stock-request.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";

const getMyStockRequests = async (req, res) => {
    try {
        const branchId =
            req.user?.role === "SUPER_ADMIN"
                ? req.params.branchId
                : req.user?.branchId;
        if (!branchId) {
            return res.status(403).json({ EM: "Branch access denied", EC: 3, DT: [] });
        }
        const data = await stockRequestService.getStockRequestsByBranch(
            branchId
        );
        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};
const createStockRequest = async (req, res) => {
    try {
        const actorId = req.user?.adminId;
        const fromBranchId = req.user?.branchId ?? req.body.fromBranchId;
        if (!actorId || !fromBranchId) {
            return res.status(403).json({ EM: "Admin identity required", EC: 3, DT: null });
        }
        const payload = {
            ...req.body,
            fromBranchId,
            createdBy: actorId,
        };

        const data = await stockRequestService.createStockRequest(payload);

        await clearCacheByPattern("stock-request:*");

        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};
const updateStockRequestInfo = async (req, res) => {
    try {
        const actorId = req.user?.adminId;
        if (!actorId) {
            return res.status(403).json({ EM: "Admin identity required", EC: 3, DT: null });
        }
        const payload = {
            ...req.body,
            updatedBy: actorId,
        };

        const data = await stockRequestService.updateStockRequestInfo(
            req.params.id,
            payload
        );

        await clearCacheByPattern("stock-request:*");
        await clearCacheByPattern(`stock-request:${req.params.id}*`);

        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};
const deleteStockRequest = async (req, res) => {
    try {
        const actorId = req.user?.adminId;
        if (!actorId) {
            return res.status(403).json({ EM: "Admin identity required", EC: 3, DT: null });
        }
        const data = await stockRequestService.deleteStockRequest(
            req.params.id,
            actorId
        );

        await clearCacheByPattern("stock-request:*");
        await clearCacheByPattern(`stock-request:${req.params.id}*`);

        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};
const getPendingStockRequests = async (req, res) => {
    try {
        const data = await stockRequestService.getPendingStockRequests();

        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};

const approveStockRequest = async (req, res) => {
    try {
        const actorId = req.user?.adminId;
        if (!actorId) {
            return res.status(403).json({ EM: "Admin identity required", EC: 3, DT: null });
        }
        const data = await stockRequestService.approveStockRequest(
            req.params.id,
            actorId
        );

        await clearCacheByPattern("stock-request:*");
        await clearCacheByPattern(`stock-request:${req.params.id}*`);
        await clearCacheByPattern("transfer-receipt:*");

        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};

const rejectStockRequest = async (req, res) => {
    try {
        const { note } = req.body;
        const actorId = req.user?.adminId;
        if (!actorId) {
            return res.status(403).json({ EM: "Admin identity required", EC: 3, DT: null });
        }

        const data = await stockRequestService.rejectStockRequest(
            req.params.id,
            actorId,
            note
        );

        await clearCacheByPattern("stock-request:*");
        await clearCacheByPattern(`stock-request:${req.params.id}*`);

        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Server error",
            EC: -1,
            DT: "",
        });
    }
};

export default {
    // branch admin
    getMyStockRequests,
    createStockRequest,
    updateStockRequestInfo,
    deleteStockRequest,

    // super admin
    getPendingStockRequests,
    approveStockRequest,
    rejectStockRequest,
};
