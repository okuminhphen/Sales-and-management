import db from "../../models/index.js";

const getAllVoucher = async () => {
    try {
        let vouchers = await db.Vouchers.findAll();
        if (!vouchers) {
            return {
                EM: "failed to get all vouchers",
                EC: "1",
            };
        }
        return {
            EM: "get all vouchers success",
            EC: "0",
            DT: vouchers,
        };
    } catch {
        return {
            EM: "error from voucher service",
            EC: "-1",
        };
    }
};

const createVoucher = async (voucherData) => {
    try {
        let newVoucher = await db.Vouchers.create(voucherData);
        return {
            EM: "create voucher success",
            EC: "0",
            DT: newVoucher,
        };
    } catch (error) {
        return {
            EM: "error when creating voucher",
            EC: "-1",
        };
    }
};

const updateVoucher = async (voucherId, voucherData) => {
    try {
        let voucher = await db.Vouchers.findOne({ where: { id: voucherId } });
        if (!voucher) {
            return {
                EM: "voucher not found",
                EC: "1",
            };
        }

        await voucher.update(voucherData);

        return {
            EM: "update voucher success",
            EC: "0",
            DT: voucher,
        };
    } catch (error) {
        return {
            EM: "error when updating voucher",
            EC: "-1",
        };
    }
};

const deleteVoucher = async (voucherId) => {
    try {
        let voucher = await db.Vouchers.findOne({ where: { id: voucherId } });
        if (!voucher) {
            return {
                EM: "voucher not found",
                EC: "1",
            };
        }

        await voucher.destroy();

        return {
            EM: "delete voucher success",
            EC: "0",
        };
    } catch (error) {
        return {
            EM: "error when deleting voucher",
            EC: "-1",
        };
    }
};

export default {
    getAllVoucher,
    createVoucher,
    updateVoucher,
    deleteVoucher,
};
