import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import roleController from "./role.controller.js";
import { roleBody, roleIdParams, updateRoleBody } from "./role.dto.js";

export const createRoleRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    const superAdmins = [verifyToken, checkRole("SUPER_ADMIN")];
    router.post("/role/check", validateRequest({ body: roleBody.pick({ name: true }) }), roleController.checkRoleFunc);
    router.get("/role/read", ...managers, cache("role:all"), roleController.readRoleFunc);
    router.post("/role/create", ...superAdmins, validateRequest({ body: roleBody }), roleController.createRoleFunc);
    router.put("/role/update/:roleId", ...superAdmins, validateRequest({ params: roleIdParams, body: updateRoleBody }), roleController.updateRoleFunc);
    router.delete("/role/delete/:roleId", ...superAdmins, validateRequest({ params: roleIdParams }), roleController.deleteRoleFunc);
    return router;
};
