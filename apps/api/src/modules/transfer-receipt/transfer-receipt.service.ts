import db from "../../models/index.js";

/* ======================================================
   APPROVE TRANSFER RECEIPT
====================================================== */
const approveTransferReceipt = async (receiptId, adminId) => {
    const transaction = await db.sequelize.transaction();

    try {
        const receipt = await db.TransferReceipt.findByPk(receiptId, {
            include: [{ model: db.TransferReceiptItem, as: "items" }],
            transaction,
        });

        if (!receipt) throw new Error("Phiếu chuyển không tồn tại");
        if (receipt.status !== "pending")
            throw new Error("Phiếu không ở trạng thái pending");

        for (const item of receipt.items) {
            // 1️⃣ kiểm tra tồn kho nguồn
            const fromStock = await db.Inventory.findOne({
                where: {
                    branchId: receipt.fromBranchId,
                    productSizeId: item.productSizeId,
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!fromStock || fromStock.stock < item.quantity) {
                throw new Error(
                    `Không đủ tồn kho (productSizeId=${item.productSizeId})`
                );
            }

            // 2️⃣ trừ kho nguồn
            fromStock.stock -= item.quantity;

            await fromStock.save({ transaction });

            // 3️⃣ cộng kho đích
            const [toStock] = await db.Inventory.findOrCreate({
                where: {
                    branchId: receipt.toBranchId,
                    productSizeId: item.productSizeId,
                },
                defaults: { stock: 0 },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            toStock.stock += item.quantity;
            await toStock.save({ transaction });
        }

        receipt.status = "approved";
        receipt.approvedBy = adminId;
        await receipt.save({ transaction });

        await db.TransferHistory.create(
            {
                transferReceiptId: receipt.id,
                action: "APPROVED",
                performedBy: adminId,
                note: "Đã duyệt và cập nhật tồn kho",
            },
            { transaction }
        );

        await transaction.commit();
        return receipt;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const completeTransferReceipt = async (receiptId, adminId) => {
    const transaction = await db.sequelize.transaction();
    try {
        const receipt = await db.TransferReceipt.findByPk(receiptId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!receipt) throw new Error("Phiếu chuyển không tồn tại");
        if (receipt.status !== "approved") {
            throw new Error("Chỉ phiếu đã duyệt mới có thể hoàn tất");
        }
        receipt.status = "completed";
        await receipt.save({ transaction });
        await db.TransferHistory.create(
            {
                transferReceiptId: receipt.id,
                action: "COMPLETED",
                performedBy: adminId,
                note: "Chi nhánh đích xác nhận đã nhận hàng",
            },
            { transaction }
        );
        await transaction.commit();
        return { EM: "Complete transfer receipt success", EC: 0, DT: receipt };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/* ======================================================
   REJECT TRANSFER RECEIPT
====================================================== */
const rejectTransferReceipt = async (receiptId, adminId, note) => {
    const t = await db.sequelize.transaction();
    try {
        const receipt = await db.TransferReceipt.findByPk(receiptId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!receipt) {
            await t.rollback();
            return { EM: "Transfer receipt not found", EC: 1 };
        }

        if (receipt.status !== "pending") {
            await t.rollback();
            return { EM: "Only pending receipt can be rejected", EC: 2 };
        }

        await receipt.update(
            {
                status: "rejected",
                approvedBy: adminId,
            },
            { transaction: t }
        );

        await db.TransferHistory.create(
            {
                transferReceiptId: receipt.id,
                action: "REJECTED",
                performedBy: adminId,
                note: note || "Từ chối phiếu chuyển kho",
            },
            { transaction: t }
        );

        await t.commit();
        return { EM: "Reject transfer receipt success", EC: 0 };
    } catch (e) {
        console.error(e);
        await t.rollback();
        return { EM: "Reject transfer receipt failed", EC: 3 };
    }
};

/* ======================================================
   CANCEL TRANSFER RECEIPT
====================================================== */
const cancelTransferReceipt = async (receiptId, adminId) => {
    const t = await db.sequelize.transaction();
    try {
        const receipt = await db.TransferReceipt.findByPk(receiptId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!receipt) {
            await t.rollback();
            return { EM: "Transfer receipt not found", EC: 1 };
        }

        if (receipt.status !== "pending") {
            await t.rollback();
            return { EM: "Cannot cancel processed receipt", EC: 2 };
        }

        await receipt.update(
            {
                status: "cancelled",
            },
            { transaction: t }
        );

        await db.TransferHistory.create(
            {
                transferReceiptId: receipt.id,
                action: "CANCELLED",
                performedBy: adminId,
                note: "Hủy phiếu chuyển kho",
            },
            { transaction: t }
        );

        await t.commit();
        return { EM: "Cancel transfer receipt success", EC: 0 };
    } catch (e) {
        console.error(e);
        await t.rollback();
        return { EM: "Cancel transfer receipt failed", EC: 4 };
    }
};

/* ======================================================
   GET LIST
====================================================== */
const getAllTransferReceipts = async () => {
    try {
        const receipts = await db.TransferReceipt.findAll({
            include: [
                { model: db.Branch, as: "fromBranch" },
                { model: db.Branch, as: "toBranch" },
            ],
            order: [["createdAt", "DESC"]],
        });

        return { EM: "Get transfer receipts success", EC: 0, DT: receipts };
    } catch (e) {
        console.error(e);
        return { EM: "Get transfer receipts failed", EC: 1, DT: [] };
    }
};

/* ======================================================
   GET DETAIL
====================================================== */
const getTransferReceiptDetail = async (id) => {
    try {
        const receipt = await db.TransferReceipt.findByPk(id, {
            include: [
                { model: db.Branch, as: "fromBranch" },
                { model: db.Branch, as: "toBranch" },
                {
                    model: db.TransferReceiptItem,
                    as: "items",
                    include: [
                        {
                            model: db.ProductSize,
                            as: "productSize",
                            include: [
                                { model: db.Product, as: "product" },
                                { model: db.Size, as: "size" },
                            ],
                        },
                    ],
                },
                { model: db.TransferHistory, as: "histories" },
            ],
        });

        if (!receipt) {
            return { EM: "Transfer receipt not found", EC: 1, DT: null };
        }

        return {
            EM: "Get transfer receipt detail success",
            EC: 0,
            DT: receipt,
        };
    } catch (e) {
        console.error(e);
        return { EM: "Get transfer receipt detail failed", EC: 2, DT: null };
    }
};

export default {
    approveTransferReceipt,
    completeTransferReceipt,
    rejectTransferReceipt,
    cancelTransferReceipt,
    getAllTransferReceipts,
    getTransferReceiptDetail,
};
