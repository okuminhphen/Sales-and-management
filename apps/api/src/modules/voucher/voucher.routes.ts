import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import voucherController from "./voucher.controller.js";
import { checkVoucherBody, updateVoucherBody, voucherBody, voucherIdParams } from "./voucher.dto.js";

export const createVoucherRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    router.get("/voucher/read", verifyToken, cache("voucher:all"), voucherController.readVoucherFunc);
    router.post("/voucher/create", ...managers, validateRequest({ body: voucherBody }), voucherController.createVoucherFunc);
    router.put("/voucher/update/:voucherId", ...managers, validateRequest({ params: voucherIdParams, body: updateVoucherBody }), voucherController.updateVoucherFunc);
    router.delete("/voucher/delete/:voucherId", ...managers, validateRequest({ params: voucherIdParams }), voucherController.deleteVoucherFunc);
    router.post("/voucher/check", verifyToken, validateRequest({ body: checkVoucherBody }), voucherController.checkVoucherFunc);
    return router;
};
