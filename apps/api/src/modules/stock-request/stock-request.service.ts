import db from "../../models/index.js";
import notificationService from "../notification/notification.service.js";

/* ======================================================
   ADMIN CHI NHÁNH
====================================================== */

/**
 * Lấy danh sách request của 1 chi nhánh
 */
const getStockRequestsByBranch = async (branchId) => {
    try {
        if (!branchId) {
            return { EM: "branchId is required", EC: 1, DT: [] };
        }
        const data = await db.StockRequest.findAll({
            where: { fromBranchId: branchId },
            include: [
                {
                    model: db.Branch,
                    as: "fromBranch",
                    attributes: ["id", "name"],
                },
                {
                    model: db.Branch,
                    as: "toBranch",
                    attributes: ["id", "name"],
                },
                {
                    model: db.StockRequestItem,
                    as: "items",
                    include: [
                        {
                            model: db.ProductSize,
                            as: "productSize",
                            include: [
                                {
                                    model: db.Product,
                                    as: "product",
                                },
                                {
                                    model: db.Size,
                                    as: "size",
                                },
                            ],
                        },
                    ],
                },
                {
                    model: db.StockHistory,
                    as: "histories",
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return { EM: "Get stock requests success", EC: 0, DT: data };
    } catch (e) {
        console.log(e);
        return { EM: "Failed to get stock requests", EC: 1, DT: [] };
    }
};

/**
 * Tạo yêu cầu tồn kho
 */
const createStockRequest = async (payload) => {
    console.log(payload);
    const t = await db.sequelize.transaction();
    try {
        const { items } = payload;

        const request = await db.StockRequest.create(
            {
                fromBranchId: payload.fromBranchId,
                toBranchId: payload.toBranchId,
                createdBy: payload.createdBy,
                status: "pending",
            },
            { transaction: t }
        );

        const formattedItems = items.map((item) => ({
            stockRequestId: request.id,
            productSizeId: item.productSizeId,
            quantity: item.quantity,
            note: item.note || "",
        }));

        await db.StockRequestItem.bulkCreate(formattedItems, {
            transaction: t,
        });

        await db.StockHistory.create(
            {
                stockRequestId: request.id,
                action: "REQUESTED",
                performedBy: payload.createdBy,
                note: "Tạo yêu cầu tồn kho",
            },
            { transaction: t }
        );

        await t.commit();

        // sau commit mới update code
        await request.update({
            code: `RQ${String(request.id).padStart(4, "0")}`,
        });

        // // 🔔 NOTIFY SUPER_ADMIN
        // const superAdmins = await db.User.findAll({
        //     where: { role: "SUPER_ADMIN" },
        //     attributes: ["id"],
        // });

        // for (const admin of superAdmins) {
        //     await notificationService.createNotification({
        //         userId: admin.id,
        //         title: "Yêu cầu tồn kho mới",
        //         content: `Chi nhánh ${payload.fromBranchId} vừa tạo yêu cầu tồn kho`,
        //         type: "STOCK_REQUEST",
        //     });
        // }
        return { EM: "Create stock request success", EC: 0, DT: request };
    } catch (e) {
        console.log(e);
        await t.rollback();
        return { EM: "Create stock request failed", EC: 3, DT: "" };
    }
};

/**
 * Sửa yêu cầu (CHỈ pending + CHỈ người tạo)
 */
const updateStockRequestInfo = async (requestId, payload) => {
    const t = await db.sequelize.transaction();
    try {
        const { items, updatedBy } = payload;

        const request = await db.StockRequest.findByPk(requestId);
        if (!request) {
            await t.rollback();
            return { EM: "Request not found", EC: 1 };
        }

        if (request.status !== "pending") {
            await t.rollback();
            return { EM: "Request already processed", EC: 2 };
        }

        if (request.createdBy !== updatedBy) {
            await t.rollback();
            return { EM: "Permission denied", EC: 3 };
        }

        await db.StockRequestItem.destroy({
            where: { stockRequestId: requestId },
            transaction: t,
        });

        const formattedItems = items.map((item) => ({
            stockRequestId: requestId,
            productSizeId: item.productSizeId,
            quantity: item.quantity,
            note: item.note || "",
        }));

        await db.StockRequestItem.bulkCreate(formattedItems, {
            transaction: t,
        });

        await db.StockHistory.create(
            {
                stockRequestId: requestId,
                action: "UPDATED",
                performedBy: updatedBy,
                note: "Cập nhật yêu cầu",
            },
            { transaction: t }
        );

        await t.commit();
        return { EM: "Update request success", EC: 0 };
    } catch (e) {
        console.log(e);
        await t.rollback();
        return { EM: "Update request failed", EC: 4 };
    }
};

/**
 * Xóa yêu cầu (CHỈ pending)
 */
const deleteStockRequest = async (requestId, deletedBy) => {
    const t = await db.sequelize.transaction();
    try {
        const request = await db.StockRequest.findByPk(requestId);
        if (!request) {
            await t.rollback();
            return { EM: "Request not found", EC: 1 };
        }

        if (request.status !== "pending") {
            await t.rollback();
            return { EM: "Cannot delete processed request", EC: 2 };
        }

        if (request.createdBy !== deletedBy) {
            await t.rollback();
            return { EM: "Permission denied", EC: 3 };
        }

        await db.StockRequestItem.destroy({
            where: { stockRequestId: requestId },
            transaction: t,
        });

        await db.StockHistory.destroy({
            where: { stockRequestId: requestId },
            transaction: t,
        });

        await request.destroy({ transaction: t });

        await t.commit();
        return { EM: "Delete request success", EC: 0 };
    } catch (e) {
        console.log(e);
        await t.rollback();
        return { EM: "Delete request failed", EC: 4 };
    }
};

/* ======================================================
   ADMIN TỔNG
====================================================== */

/**
 * Lấy danh sách request cần duyệt
 */
const getPendingStockRequests = async () => {
    try {
        const data = await db.StockRequest.findAll({
            where: { status: "pending" },
            include: [
                {
                    model: db.Branch,
                    as: "fromBranch",
                    attributes: ["id", "name"],
                },
                {
                    model: db.Branch,
                    as: "toBranch",
                    attributes: ["id", "name"],
                },
                {
                    model: db.StockRequestItem,
                    as: "items",
                    include: [
                        {
                            model: db.ProductSize,
                            as: "productSize",
                            include: [
                                {
                                    model: db.Product,
                                    as: "product",
                                    attributes: ["id", "name"],
                                },
                                {
                                    model: db.Size,
                                    as: "size",
                                    attributes: ["id", "name"],
                                },
                            ],
                        },
                    ],
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return { EM: "Get pending requests success", EC: 0, DT: data };
    } catch (e) {
        console.log(e);
        return { EM: "Failed to get pending requests", EC: 1, DT: [] };
    }
};

/**
 * DUYỆT YÊU CẦU → TẠO TRANSFER RECEIPT
 */
const approveStockRequest = async (requestId, adminId) => {
    const t = await db.sequelize.transaction();
    try {
        /* ==========================
           0. Lấy StockRequest + items (lock)
        ========================== */
        const request = await db.StockRequest.findByPk(requestId, {
            include: [{ model: db.StockRequestItem, as: "items" }],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!request) {
            await t.rollback();
            return { EM: "Request not found", EC: 1 };
        }

        if (request.status !== "pending") {
            await t.rollback();
            return { EM: "Request already processed", EC: 2 };
        }

        /* ==========================
           1. Update StockRequest
        ========================== */
        await request.update(
            {
                status: "approved",
                approvedBy: adminId,
            },
            { transaction: t }
        );

        /* ==========================
           2. Lưu lịch sử StockRequest
        ========================== */
        await db.StockHistory.create(
            {
                stockRequestId: request.id,
                action: "APPROVED",
                performedBy: adminId,
                note: "Duyệt yêu cầu tồn kho",
            },
            { transaction: t }
        );

        /* ==========================
           3. Tạo TransferReceipt
           (CHỈ TẠO – CHƯA CỘNG/TRỪ KHO)
        ========================== */
        const receipt = await db.TransferReceipt.create(
            {
                stockRequestId: request.id, // ✅ BẮT BUỘC
                fromBranchId: request.toBranchId, // kho cấp
                toBranchId: request.fromBranchId, // kho nhận
                createdBy: adminId,
                status: "pending", // ✅ ĐÚNG NGHIỆP VỤ
            },
            { transaction: t }
        );

        /* ==========================
           4. Tạo TransferReceiptItem
        ========================== */
        const receiptItems = request.items.map((item) => ({
            transferReceiptId: receipt.id,
            productSizeId: item.productSizeId,
            quantity: item.quantity,
            note: item.note || "",
        }));

        await db.TransferReceiptItem.bulkCreate(receiptItems, {
            transaction: t,
        });

        /* ==========================
           5. Lưu TransferHistory
        ========================== */
        await db.TransferHistory.create(
            {
                transferReceiptId: receipt.id,
                action: "CREATED",
                performedBy: adminId,
                note: `Tạo từ StockRequest ${request.code || request.id}`,
            },
            { transaction: t }
        );

        await t.commit();

        // 🔔 NOTIFY BRANCH ADMIN (người tạo request)
        await notificationService.createNotification({
            userId: request.createdBy,
            title: "Yêu cầu tồn kho được duyệt",
            content: `Yêu cầu tồn kho ${
                request.code || request.id
            } đã được duyệt`,
            type: "STOCK_REQUEST",
        });

        return {
            EM: "Approve stock request success",
            EC: 0,
            DT: {
                stockRequestId: request.id,
                transferReceiptId: receipt.id,
            },
        };
    } catch (e) {
        console.error(e);
        await t.rollback();
        return { EM: "Approve request failed", EC: 3 };
    }
};

/**
 * TỪ CHỐI YÊU CẦU
 */
const rejectStockRequest = async (requestId, adminId, note) => {
    const t = await db.sequelize.transaction();
    try {
        const request = await db.StockRequest.findByPk(requestId);
        if (!request) {
            await t.rollback();
            return { EM: "Request not found", EC: 1 };
        }
        if (request.status !== "pending") {
            await t.rollback();
            return { EM: "Request already processed", EC: 2 };
        }

        await request.update(
            { status: "rejected", approvedBy: adminId },
            { transaction: t }
        );

        await db.StockHistory.create(
            {
                stockRequestId: requestId,
                action: "REJECTED",
                performedBy: adminId,
                note: note || "Từ chối yêu cầu",
            },
            { transaction: t }
        );

        await t.commit();

        // 🔔 NOTIFY người tạo
        await notificationService.createNotification({
            userId: request.createdBy,
            title: "Yêu cầu tồn kho bị từ chối",
            content: note || "Yêu cầu tồn kho của bạn đã bị từ chối",
            type: "STOCK_REQUEST",
        });

        return { EM: "Reject request success", EC: 0 };
    } catch (e) {
        console.log(e);
        await t.rollback();
        return { EM: "Reject request failed", EC: 3 };
    }
};

/* ======================================================
   EXPORT
====================================================== */

export default {
    // branch admin
    getStockRequestsByBranch,
    createStockRequest,
    updateStockRequestInfo,
    deleteStockRequest,

    // super admin
    getPendingStockRequests,
    approveStockRequest,
    rejectStockRequest,
};
