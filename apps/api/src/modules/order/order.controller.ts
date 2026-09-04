import orderService from "./order.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";

const ORDER_STATUSES = new Set([
    "PENDING",
    "CONFIRMED",
    "SHIPPING",
    "COMPLETED",
    "CANCELLED",
]);
const readFunc = async (req, res) => {
    try {
        let data = await orderService.getAllOrders();
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const createFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }
        let orderData = { ...req.body, userId };
        let data = await orderService.createOrder(orderData);

        // Xóa cache liên quan đến orders
        await clearCacheByPattern("order:*");
        if (orderData.userId) {
            await clearCacheByPattern(`order:user:${orderData.userId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const updateFunc = async (req, res) => {
    try {
        let orderId = req.body.id;
        const status = req.body.status;
        if (!orderId || !ORDER_STATUSES.has(status)) {
            return res.status(400).json({ EM: "Invalid order update", EC: 1, DT: null });
        }
        let orderData = { status };
        let data = await orderService.updateOrder(orderId, orderData);

        // Xóa cache liên quan đến orders
        await clearCacheByPattern("order:*");
        if (orderId) {
            await clearCacheByPattern(`order:${orderId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const deleteFunc = async (req, res) => {
    try {
        let orderId = req.body.id;

        let data = await orderService.deleteOrder(orderId);

        // Xóa cache liên quan đến orders
        await clearCacheByPattern("order:*");
        if (orderId) {
            await clearCacheByPattern(`order:${orderId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const readByUserIdFunc = async (req, res) => {
    try {
        const requestedUserId = Number(req.params.userId);
        const isAdmin = req.user?.adminId !== undefined;
        if (!isAdmin && req.user?.userId !== requestedUserId) {
            return res.status(403).json({ EM: "Order access denied", EC: 3, DT: [] });
        }
        let userId = requestedUserId;
        let data = await orderService.getOrdersByUserId(userId);
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const updateStatusFunc = async (req, res) => {
    try {
        let orderId = req.params.orderId;
        let updatedData = req.body.status;
        if (!ORDER_STATUSES.has(updatedData)) {
            return res.status(400).json({ EM: "Invalid order status", EC: 1, DT: null });
        }

        let data = await orderService.updateOrderStatus(
            orderId,
            updatedData,
            req.user
        );

        // Xóa cache liên quan đến orders
        await clearCacheByPattern("order:*");
        if (orderId) {
            await clearCacheByPattern(`order:${orderId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

const readByBranchIdFunc = async (req, res) => {
    try {
        const branchId =
            req.user?.role === "SUPER_ADMIN"
                ? req.params.branchId
                : req.user?.branchId;
        if (!branchId) {
            return res.status(403).json({ EM: "Branch access denied", EC: 3, DT: [] });
        }
        let data = await orderService.getOrdersByBranchId(branchId);
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const createAtBranchFunc = async (req, res) => {
    try {
        const branchId = req.user?.branchId ?? req.body.branchId;
        if (!branchId) {
            return res.status(403).json({ EM: "Branch identity required", EC: 3, DT: null });
        }
        let orderData = { ...req.body, branchId };
        let data = await orderService.createOrderAtBranch(orderData);

        // Xóa cache liên quan đến orders
        await clearCacheByPattern("order:*");
        if (orderData.branchId) {
            await clearCacheByPattern(`order:branch:${orderData.branchId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
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
    readByUserIdFunc,
    updateStatusFunc,
    readByBranchIdFunc,
    createAtBranchFunc,
};
