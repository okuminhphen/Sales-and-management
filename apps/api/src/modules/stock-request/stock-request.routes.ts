import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import stockController from "./stock-request.controller.js";
import { branchIdParams, createStockRequestBody, rejectStockRequestBody, stockRequestIdParams, updateStockRequestBody } from "./stock-request.dto.js";

export const createStockRequestRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("BRANCH_MANAGER", "SUPER_ADMIN")];
    const superAdmins = [verifyToken, checkRole("SUPER_ADMIN")];
    router.get("/stock-requests/my/:branchId", ...managers, validateRequest({ params: branchIdParams }), cache("stock-request:branch"), stockController.getMyStockRequests);
    router.post("/stock-requests", ...managers, validateRequest({ body: createStockRequestBody }), stockController.createStockRequest);
    router.put("/stock-requests/:id", ...managers, validateRequest({ params: stockRequestIdParams, body: updateStockRequestBody }), stockController.updateStockRequestInfo);
    router.delete("/stock-requests/:id", ...managers, validateRequest({ params: stockRequestIdParams }), stockController.deleteStockRequest);
    router.get("/admin/stock-requests/pending", ...superAdmins, stockController.getPendingStockRequests);
    router.post("/admin/stock-requests/:id/approve", ...superAdmins, validateRequest({ params: stockRequestIdParams }), stockController.approveStockRequest);
    router.post("/admin/stock-requests/:id/reject", ...superAdmins, validateRequest({ params: stockRequestIdParams, body: rejectStockRequestBody }), stockController.rejectStockRequest);
    return router;
};
