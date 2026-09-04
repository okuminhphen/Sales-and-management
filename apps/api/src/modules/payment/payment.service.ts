import db from "../../models/index.js";

const getPaymentMethods = async () => {
    try {
        let paymentMethods = await db.PaymentMethods.findAll();

        return {
            EM: "Get payment methods successfully",
            EC: "0",
            DT: paymentMethods,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};

const getPayableOrder = async (orderId, userId) => {
    return db.Orders.findOne({
        where: { id: orderId, userId },
        attributes: ["id", "userId", "totalPrice", "status"],
    });
};

const updatePaymentStatus = async (orderId, status, transactionNo) => {
    try {
        let payment = await db.Payment.findOne({ where: { orderId } });
        if (!payment) {
            return {
                EM: "Payment record not found",
                EC: "1",
                DT: "",
            };
        }

        // Chuẩn hóa status: PAID/QR thành COMPLETED
        let updatedStatus = status;
        console.log("updatedStatus", updatedStatus);

        let updateData: { status: string; transactionId?: string } = { status: updatedStatus };

        if (transactionNo) {
            updateData.transactionId = transactionNo;
        }

        await db.Payment.update(updateData, {
            where: { orderId },
        });
        console.log("updateData", updateData);
        return {
            EM: "Update payment status successfully",
            EC: "0",
            DT: { orderId, status: updatedStatus },
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};
export default { getPaymentMethods, getPayableOrder, updatePaymentStatus };
