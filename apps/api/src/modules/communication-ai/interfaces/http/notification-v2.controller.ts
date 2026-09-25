import type { RequestHandler, Response } from "express";
import type { NotificationV2Service, NotificationViewV2 } from "../../application/notification-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

const contextOf = (request: Parameters<RequestHandler>[0]) =>
    (request as V2AuthenticatedRequest).v2AccessContext;

const reject = (response: Response, status: number, message: string, data: unknown): void => {
    response.status(status).json({ EM: message, EC: status === 401 || status === 403 ? 3 : status >= 500 ? -1 : 1, DT: data });
};

const displayNotification = (notification: NotificationViewV2) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    content: notification.content,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
});

/** HTTP adapter only; recipient identity stays wholly inside the V2 access context. */
export const createNotificationV2Controller = (notifications: Pick<
    NotificationV2Service, "listOwn" | "countUnreadOwn" | "markOwnRead"
>): { listOwn: RequestHandler; countUnreadOwn: RequestHandler; markOwnRead: RequestHandler } => ({
    listOwn: async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", []);
            return;
        }
        const result = await notifications.listOwn(context, request.query);
        switch (result.kind) {
            case "notifications":
                response.status(200).json({ EM: "Get notifications successfully", EC: 0,
                    DT: result.page.notifications.map(displayNotification),
                    pagination: { nextCursor: result.page.nextCursor } });
                return;
            case "invalid_notification_query":
                reject(response, 400, "Invalid notification query", []); return;
            case "notification_unavailable":
                reject(response, 503, "Notification service unavailable", []); return;
        }
    },
    countUnreadOwn: async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", 0);
            return;
        }
        const result = await notifications.countUnreadOwn(context);
        switch (result.kind) {
            case "unread_count":
                response.status(200).json({ EM: "Get unread notification count successfully", EC: 0, DT: result.count });
                return;
            case "notification_unavailable":
                reject(response, 503, "Notification service unavailable", 0); return;
        }
    },
    markOwnRead: async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            reject(response, 401, "Authentication required", null);
            return;
        }
        response.locals.auditResourceId = request.params.notificationId;
        const result = await notifications.markOwnRead(context, request.params.notificationId);
        switch (result.kind) {
            case "marked":
            case "already_read":
                response.status(200).json({ EM: "Mark notification as read successfully", EC: 0,
                    DT: { notificationId: request.params.notificationId, alreadyRead: result.kind === "already_read" } });
                return;
            case "notification_not_found":
                reject(response, 404, "Notification not found", null); return;
            case "invalid_notification_id":
                reject(response, 400, "Invalid notification ID", null); return;
            case "notification_unavailable":
                reject(response, 503, "Notification service unavailable", null); return;
        }
    },
});
