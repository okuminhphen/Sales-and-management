import transferReceiptService from "./transfer-receipt.service.js";

const getAllTransferReceipts = async (req, res) => {
    const data = await transferReceiptService.getAllTransferReceipts();
    return res.status(200).json(data);
};

const getTransferReceiptDetail = async (req, res) => {
    const data = await transferReceiptService.getTransferReceiptDetail(
        req.params.id
    );
    return res.status(200).json(data);
};

const completeTransferReceipt = async (req, res) => {
    const adminId = req.user?.adminId ?? req.user?.userId;
    const data = await transferReceiptService.completeTransferReceipt(
        req.params.id,
        adminId
    );
    return res.status(200).json(data);
};

const approveTransferReceipt = async (req, res) => {
    const adminId = req.user?.adminId ?? req.user?.userId;
    const data = await transferReceiptService.approveTransferReceipt(
        req.params.id,
        adminId
    );
    return res.status(200).json(data);
};
const rejectTransferReceipt = async (req, res) => {
    const adminId = req.user?.adminId ?? req.user?.userId;
    const { reason } = req.body;
    const data = await transferReceiptService.rejectTransferReceipt(
        req.params.id,
        adminId,
        reason
    );
    return res.status(200).json(data);
};

const cancelTransferReceipt = async (req, res) => {
    const adminId = req.user?.adminId ?? req.user?.userId;
    const data = await transferReceiptService.cancelTransferReceipt(
        req.params.id,
        adminId
    );
    return res.status(200).json(data);
};

export default {
    getAllTransferReceipts,
    getTransferReceiptDetail,
    completeTransferReceipt,
    rejectTransferReceipt,
    approveTransferReceipt,
    cancelTransferReceipt,
};
