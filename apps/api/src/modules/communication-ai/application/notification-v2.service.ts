import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

const MAX_NOTIFICATION_PAGE_SIZE = 100;
const DEFAULT_NOTIFICATION_PAGE_SIZE = 30;

export type NotificationTypeV2 =
    | "order_new"
    | "order_updated"
    | "low_stock"
    | "stock_request"
    | "transfer_receipt"
    | "system";

/** Deliberately excludes the untyped notification `data` JSON column. */
export type NotificationViewV2 = {
    id: EntityId;
    type: NotificationTypeV2;
    title: string;
    content: string;
    readAt: string | null;
    createdAt: string;
};

export type NotificationCursorV2 = {
    beforeCreatedAt: string;
    beforeId: EntityId;
};

export type NotificationPageV2 = {
    notifications: readonly NotificationViewV2[];
    nextCursor: NotificationCursorV2 | null;
};

type OwnNotificationIdentity = { accountId: EntityId };

export type NotificationListOutcome = { kind: "notifications"; page: NotificationPageV2 };
export type NotificationUnreadCountOutcome = { kind: "unread_count"; count: number };
export type NotificationMarkReadOutcome = { kind: "marked" | "already_read" | "notification_not_found" };

export interface NotificationV2Repository {
    listOwn: (input: OwnNotificationIdentity & {
        beforeCreatedAt: string | null;
        beforeId: EntityId | null;
        limit: number;
    }) => Promise<NotificationListOutcome>;
    countUnreadOwn: (input: OwnNotificationIdentity) => Promise<NotificationUnreadCountOutcome>;
    markOwnRead: (input: OwnNotificationIdentity & { notificationId: EntityId }) => Promise<NotificationMarkReadOutcome>;
}

export type NotificationListResult = NotificationListOutcome
    | { kind: "invalid_notification_query" | "notification_unavailable" };
export type NotificationUnreadCountResult = NotificationUnreadCountOutcome
    | { kind: "notification_unavailable" };
export type NotificationMarkReadResult = NotificationMarkReadOutcome
    | { kind: "invalid_notification_id" | "notification_unavailable" };

const canonicalIsoTimestamp = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : value;
};

const normalizeListQuery = (input: {
    beforeCreatedAt?: unknown;
    beforeId?: unknown;
    limit?: unknown;
} | undefined): {
    beforeCreatedAt: string | null;
    beforeId: EntityId | null;
    limit: number;
} | null => {
    const limit = input?.limit === undefined ? DEFAULT_NOTIFICATION_PAGE_SIZE : input.limit;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit)
        || limit < 1 || limit > MAX_NOTIFICATION_PAGE_SIZE) return null;

    const hasTimestamp = input?.beforeCreatedAt !== undefined && input.beforeCreatedAt !== null;
    const hasId = input?.beforeId !== undefined && input.beforeId !== null;
    if (hasTimestamp !== hasId) return null;
    if (!hasTimestamp) return { beforeCreatedAt: null, beforeId: null, limit };

    const beforeCreatedAt = canonicalIsoTimestamp(input?.beforeCreatedAt);
    if (!beforeCreatedAt) return null;
    try {
        return { beforeCreatedAt, beforeId: serializeEntityId(input?.beforeId), limit };
    } catch {
        return null;
    }
};

/**
 * Account-owned V2 notification boundary. It neither creates nor dispatches a
 * notification and cannot expose untyped storage payloads to an adapter.
 */
export class NotificationV2Service {
    constructor(private readonly dependencies: { repository: NotificationV2Repository }) {}

    async listOwn(
        context: V2AccessContext,
        input?: { beforeCreatedAt?: unknown; beforeId?: unknown; limit?: unknown },
    ): Promise<NotificationListResult> {
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_notification_query" };
        let accountId: EntityId;
        try {
            accountId = serializeEntityId(context.accountId);
        } catch {
            return { kind: "invalid_notification_query" };
        }
        try {
            return await this.dependencies.repository.listOwn({ accountId, ...query });
        } catch {
            return { kind: "notification_unavailable" };
        }
    }

    async countUnreadOwn(context: V2AccessContext): Promise<NotificationUnreadCountResult> {
        let accountId: EntityId;
        try {
            accountId = serializeEntityId(context.accountId);
        } catch {
            return { kind: "notification_unavailable" };
        }
        try {
            return await this.dependencies.repository.countUnreadOwn({ accountId });
        } catch {
            return { kind: "notification_unavailable" };
        }
    }

    async markOwnRead(context: V2AccessContext, notificationIdInput: unknown): Promise<NotificationMarkReadResult> {
        let accountId: EntityId;
        let notificationId: EntityId;
        try {
            accountId = serializeEntityId(context.accountId);
            notificationId = serializeEntityId(notificationIdInput);
        } catch {
            return { kind: "invalid_notification_id" };
        }
        try {
            return await this.dependencies.repository.markOwnRead({ accountId, notificationId });
        } catch {
            return { kind: "notification_unavailable" };
        }
    }
}
