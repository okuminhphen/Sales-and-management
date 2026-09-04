import voucherService from "./voucher.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";
const readVoucherFunc = async (req, res) => {
    try {
        let data = await voucherService.getAllVoucher();
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const createVoucherFunc = async (req, res) => {
    try {
        const voucherData = req.body;
        console.log(voucherData);
        let data = await voucherService.createVoucher(voucherData);

        // Xóa cache liên quan đến vouchers
        await clearCacheByPattern("voucher:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};
const updateVoucherFunc = async (req, res) => {
    try {
        const voucherId = req.params.voucherId;
        const voucherData = req.body;

        let data = await voucherService.updateVoucher(voucherId, voucherData);

        // Xóa cache liên quan đến vouchers
        await clearCacheByPattern("voucher:*");
        if (voucherId) {
            await clearCacheByPattern(`voucher:${voucherId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};
const deleteVoucherFunc = async (req, res) => {
    try {
        const voucherId = req.params.voucherId;

        let data = await voucherService.deleteVoucher(voucherId);
        console.log(data);

        // Xóa cache liên quan đến vouchers
        await clearCacheByPattern("voucher:*");
        if (voucherId) {
            await clearCacheByPattern(`voucher:${voucherId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const checkVoucherFunc = (req, res) => {};

export default {
    readVoucherFunc,
    createVoucherFunc,
    updateVoucherFunc,
    deleteVoucherFunc,
    checkVoucherFunc,
};
