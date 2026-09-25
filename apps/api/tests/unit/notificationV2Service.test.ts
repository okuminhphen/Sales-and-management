import { describe, expect, it, vi } from "vitest";
import {
    NotificationV2Service,
    type NotificationPageV2,
    type NotificationV2Repository,
    type NotificationViewV2,
} from "../../src/modules/communication-ai/application/notification-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: null,
    employeeId: "9007199254740994",
    grants: [],
};

const notification: NotificationViewV2 = {
    id: serializeEntityId("9007199254740995"),
    type: "system",
    title: "Thông báo hệ thống",
    content: "Nội dung an toàn",
    readAt: null,
    createdAt: "2026-09-25T00:00:00.000Z",
};

const page: NotificationPageV2 = { notifications: [notification], nextCursor: null };

const repository = (): NotificationV2Repository => ({
    listOwn: vi.fn(async () => ({ kind: "notifications" as const, page })),
    countUnreadOwn: vi.fn(async () => ({ kind: "unread_count" as const, count: 1 })),
    markOwnRead: vi.fn(async () => ({ kind: "marked" as const })),
});

describe("NotificationV2Service", () => {
    it("reads a bounded page only for the DB-derived account identity", async () => {
        const store = repository();
        const service = new NotificationV2Service({ repository: store });

        await expect(service.listOwn(context, {
            beforeCreatedAt: "2026-09-26T00:00:00.000Z", beforeId: "9007199254740996", limit: 20,
        })).resolves.toEqual({ kind: "notifications", page });
        expect(store.listOwn).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId),
            beforeCreatedAt: "2026-09-26T00:00:00.000Z",
            beforeId: serializeEntityId("9007199254740996"),
            limit: 20,
        });
    });

    it("rejects incomplete or unsafe pagination before persistence", async () => {
        const store = repository();
        const service = new NotificationV2Service({ repository: store });

        await expect(service.listOwn(context, { beforeCreatedAt: "not-a-date", beforeId: "1" }))
            .resolves.toEqual({ kind: "invalid_notification_query" });
        await expect(service.listOwn(context, { beforeCreatedAt: "2026-09-26T00:00:00.000Z" }))
            .resolves.toEqual({ kind: "invalid_notification_query" });
        await expect(service.listOwn(context, { limit: 101 })).resolves.toEqual({ kind: "invalid_notification_query" });
        expect(store.listOwn).not.toHaveBeenCalled();
    });

    it("counts and marks only an owned notification without exposing storage detail", async () => {
        const store = repository();
        const service = new NotificationV2Service({ repository: store });

        await expect(service.countUnreadOwn(context)).resolves.toEqual({ kind: "unread_count", count: 1 });
        await expect(service.markOwnRead(context, "9007199254740995")).resolves.toEqual({ kind: "marked" });
        expect(store.countUnreadOwn).toHaveBeenCalledWith({ accountId: serializeEntityId(context.accountId) });
        expect(store.markOwnRead).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId), notificationId: serializeEntityId("9007199254740995"),
        });

        vi.mocked(store.markOwnRead).mockResolvedValueOnce({ kind: "notification_not_found" });
        await expect(service.markOwnRead(context, "9007199254740995"))
            .resolves.toEqual({ kind: "notification_not_found" });
        vi.mocked(store.countUnreadOwn).mockRejectedValueOnce(new Error("database detail"));
        await expect(service.countUnreadOwn(context)).resolves.toEqual({ kind: "notification_unavailable" });
    });
});
