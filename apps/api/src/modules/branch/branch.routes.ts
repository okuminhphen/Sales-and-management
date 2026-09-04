import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import branchController from "./branch.controller.js";
import { branchIdParams, branchQuery, createBranchBody, updateBranchBody } from "./branch.dto.js";

export const createBranchRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    const superAdmins = [verifyToken, checkRole("SUPER_ADMIN")];
    router.get("/branch/read", validateRequest({ query: branchQuery }), cache("branch:all"), branchController.readFunc);
    router.get("/branch/:branchId", ...managers, validateRequest({ params: branchIdParams }), cache("branch"), branchController.getDetailFunc);
    router.post("/branch/create", ...superAdmins, validateRequest({ body: createBranchBody }), branchController.createFunc);
    router.put("/branch/update/:branchId", ...superAdmins, validateRequest({ params: branchIdParams, body: updateBranchBody }), branchController.updateFunc);
    router.delete("/branch/delete/:branchId", ...superAdmins, validateRequest({ params: branchIdParams }), branchController.deleteFunc);
    return router;
};
