import { Router } from "express";
import userController from "./user.controller.js";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import {
    createUserBody,
    updatePasswordBody,
    updateProfileBody,
    updateUserByAdminBody,
    userIdParams,
    userListQuery,
    userLookupParams,
} from "./user.dto.js";

export const createUserRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    router.get("/profile", verifyToken, (req, res) => res.json({ message: "Welcome!", user: req.user }));
    router.get("/user/read", ...managers, validateRequest({ query: userListQuery }), cache("user:all"), userController.readFunc);
    router.get("/user/read-all", ...managers, cache("user:all"), userController.getAllUsersFunc);
    router.get("/user/:id", verifyToken, validateRequest({ params: userLookupParams }), cache("user"), userController.getUserFunc);
    router.post("/user/create", ...managers, validateRequest({ body: createUserBody }), userController.createFunc);
    router.put("/user/update/:userId", verifyToken, validateRequest({ params: userIdParams, body: updateProfileBody }), userController.updateFunc);
    router.put("/user/update-password/:id", verifyToken, validateRequest({ params: userLookupParams, body: updatePasswordBody }), userController.updatePasswordFunc);
    router.put("/admin/user/update/:userId", ...managers, validateRequest({ params: userIdParams, body: updateUserByAdminBody }), userController.updateUserByAdminFunc);
    router.delete("/user/delete/:userId", ...managers, validateRequest({ params: userIdParams }), userController.deleteFunc);
    return router;
};
