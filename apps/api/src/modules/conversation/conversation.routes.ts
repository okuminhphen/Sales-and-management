import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import conversationController from "./conversation.controller.js";
import { userIdParams } from "./conversation.dto.js";

export const createConversationRouter = (): Router => {
    const router = Router();
    router.post("/conversation/create", verifyToken, conversationController.createFunc);
    router.get("/conversation/user/:userId", verifyToken, validateRequest({ params: userIdParams }), conversationController.getByUserFunc);
    router.get("/conversation/admin", verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER"), conversationController.readAdminFunc);
    return router;
};
