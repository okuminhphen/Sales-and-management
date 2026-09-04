import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import transferController from "./transfer-receipt.controller.js";
import { rejectionBody, transferReceiptIdParams } from "./transfer-receipt.dto.js";

export const createTransferReceiptRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("BRANCH_MANAGER", "SUPER_ADMIN")];
    const superAdmins = [verifyToken, checkRole("SUPER_ADMIN")];
    router.get("/transfer-receipts", ...managers, transferController.getAllTransferReceipts);
    router.get("/transfer-receipts/:id", ...managers, validateRequest({ params: transferReceiptIdParams }), transferController.getTransferReceiptDetail);
    router.post("/transfer-receipts/:id/complete", ...managers, validateRequest({ params: transferReceiptIdParams }), transferController.completeTransferReceipt);
    router.post("/transfer-receipts/:id/approve", ...superAdmins, validateRequest({ params: transferReceiptIdParams }), transferController.approveTransferReceipt);
    router.post("/transfer-receipts/:id/reject", ...superAdmins, validateRequest({ params: transferReceiptIdParams, body: rejectionBody }), transferController.rejectTransferReceipt);
    router.post("/transfer-receipts/:id/cancel", ...managers, validateRequest({ params: transferReceiptIdParams }), transferController.cancelTransferReceipt);
    return router;
};
