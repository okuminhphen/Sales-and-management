import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import notificationController from "./notification.controller.js";
import { notificationIdParams } from "./notification.dto.js";

export const createNotificationRouter = (): Router => {
    const router = Router();
    const guards = [verifyToken, checkRole("BRANCH_MANAGER", "SUPER_ADMIN")];
    router.get("/notifications/my", ...guards, notificationController.getMyNotificationsFunc);
    router.patch("/notifications/:id/read", ...guards, validateRequest({ params: notificationIdParams }), notificationController.markAsReadFunc);
    router.get("/notifications/count", ...guards, notificationController.countUnreadFunc);
    return router;
};
