import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import adminController from "./admin.controller.js";
import { adminIdParams, adminQuery, createAdminBody, updateAdminBody } from "./admin.dto.js";

export const createAdminRouter = (): Router => {
    const router = Router();
    const guards = [verifyToken, checkRole("SUPER_ADMIN")];
    router.get("/admin/read", ...guards, validateRequest({ query: adminQuery }), cache("admin:all"), adminController.readFunc);
    router.get("/admin/:adminId", ...guards, validateRequest({ params: adminIdParams }), cache("admin"), adminController.getAdminFunc);
    router.post("/admin/create", ...guards, validateRequest({ body: createAdminBody }), adminController.createFunc);
    router.put("/admin/update/:adminId", ...guards, validateRequest({ params: adminIdParams, body: updateAdminBody }), adminController.updateFunc);
    router.delete("/admin/delete/:adminId", ...guards, validateRequest({ params: adminIdParams }), adminController.deleteFunc);
    return router;
};
