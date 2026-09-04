import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import employeeController from "./employee.controller.js";
import { branchIdParams, employeeBody, employeeIdParams, updateEmployeeBody } from "./employee.dto.js";

export const createEmployeeRouter = (): Router => {
    const router = Router();
    const guards = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    router.get("/employee/read", ...guards, cache("employee:all"), employeeController.readFunc);
    router.get("/employee/read/:branchId", ...guards, validateRequest({ params: branchIdParams }), cache("employee:branch"), employeeController.getEmployeesByBranchIdFunc);
    router.post("/employee/create", ...guards, validateRequest({ body: employeeBody }), employeeController.createFunc);
    router.put("/employee/update/:employeeId", ...guards, validateRequest({ params: employeeIdParams, body: updateEmployeeBody }), employeeController.updateFunc);
    router.delete("/employee/delete/:employeeId", ...guards, validateRequest({ params: employeeIdParams }), employeeController.deleteFunc);
    return router;
};
