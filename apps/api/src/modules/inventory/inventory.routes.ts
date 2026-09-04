import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import inventoryController from "./inventory.controller.js";
import { branchIdParams } from "./inventory.dto.js";

export const createInventoryRouter = (): Router => {
    const router = Router();
    router.get("/inventory/:branchId", verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER"), validateRequest({ params: branchIdParams }), inventoryController.getInventoryByBranchController);
    return router;
};
