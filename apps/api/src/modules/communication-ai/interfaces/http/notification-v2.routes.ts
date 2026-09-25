import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import type { NotificationV2Service } from "../../application/notification-v2.service.js";
import { createNotificationV2Controller } from "./notification-v2.controller.js";
import { notificationListQueryV2, notificationReadBodyV2, notificationReadParamsV2 } from "./notification-v2.dto.js";

/** V2-only compatibility factory. The legacy notification router is not changed or mounted here. */
export const createNotificationV2Router = (dependencies: {
    auth: RequestHandler;
    notifications: NotificationV2Service;
    audit?: V2HttpAuditWriter;
}): Router => {
    const router = Router();
    const controller = createNotificationV2Controller(dependencies.notifications);
    router.get("/notifications/my", dependencies.auth,
        validateRequest({ query: notificationListQueryV2 }), controller.listOwn);
    router.get("/notifications/count", dependencies.auth, controller.countUnreadOwn);
    router.patch("/notifications/:notificationId/read", createV2HttpAudit("notification.mark_read", dependencies.audit),
        dependencies.auth, validateRequest({ params: notificationReadParamsV2, body: notificationReadBodyV2 }),
        controller.markOwnRead);
    return router;
};
