import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    NotificationCursorV2,
    NotificationListOutcome,
    NotificationMarkReadOutcome,
    NotificationPageV2,
    NotificationTypeV2,
    NotificationUnreadCountOutcome,
    NotificationV2Repository,
    NotificationViewV2,
} from "../application/notification-v2.service.js";

const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

type NotificationRow = {
    id: unknown;
    type: unknown;
    title: unknown;
    content: unknown;
    readAt: unknown;
    createdAt: unknown;
};

type NotificationLockRow = { id: unknown; readAt: unknown };
type CountRow = { count: unknown };

const NOTIFICATION_TYPES: ReadonlySet<NotificationTypeV2> = new Set([
    "order_new", "order_updated", "low_stock", "stock_request", "transfer_receipt", "system",
]);

const toTimestamp = (value: unknown, field: string): string => {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) throw new TypeError(`Database notification ${field} is invalid.`);
    return date.toISOString();
};

const toNotification = (row: NotificationRow): NotificationViewV2 => {
    if (typeof row.type !== "string" || !NOTIFICATION_TYPES.has(row.type as NotificationTypeV2)) {
        throw new TypeError("Database notification type is invalid.");
    }
    if (typeof row.title !== "string" || row.title.trim().length === 0 || row.title.length > 255) {
        throw new TypeError("Database notification title is invalid.");
    }
    if (typeof row.content !== "string" || row.content.trim().length === 0 || row.content.length > 1_000) {
        throw new TypeError("Database notification content is invalid.");
    }
    return {
        id: serializeDatabaseEntityId(row.id),
        type: row.type as NotificationTypeV2,
        title: row.title,
        content: row.content,
        readAt: row.readAt === null ? null : toTimestamp(row.readAt, "read timestamp"),
        createdAt: toTimestamp(row.createdAt, "creation timestamp"),
    };
};

const toUnreadCount = (value: unknown): number => {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Database unread count is invalid.");
        return value;
    }
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new TypeError("Database unread count is invalid.");
    }
    const count = BigInt(value);
    if (count > MAX_SAFE_COUNT) throw new RangeError("Database unread count exceeds safe response range.");
    return Number(count);
};

/**
 * MySQL adapter for account-owned notification reads. It selects display fields
 * explicitly so raw JSON payloads cannot cross this port by accident.
 */
export class SequelizeNotificationV2Repository implements NotificationV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listOwn(input: {
        accountId: EntityId;
        beforeCreatedAt: string | null;
        beforeId: EntityId | null;
        limit: number;
    }): Promise<NotificationListOutcome> {
        const rows = await this.persistence.sequelize.query<NotificationRow>(
            `SELECT notifications.id AS id, notifications.type AS type, notifications.title AS title,
                    notifications.content AS content, notifications.read_at AS readAt,
                    notifications.created_at AS createdAt
             FROM notifications
             INNER JOIN accounts ON accounts.id = notifications.recipient_account_id
             WHERE notifications.recipient_account_id = ? AND accounts.status = 'active'
               AND (? IS NULL OR notifications.created_at < ?
                    OR (notifications.created_at = ? AND notifications.id < ?))
             ORDER BY notifications.created_at DESC, notifications.id DESC
             LIMIT ?`,
            {
                replacements: [
                    input.accountId, input.beforeCreatedAt, input.beforeCreatedAt,
                    input.beforeCreatedAt, input.beforeId, input.limit + 1,
                ],
                type: QueryTypes.SELECT,
            },
        );
        const hasMore = rows.length > input.limit;
        const notifications = rows.slice(0, input.limit).map(toNotification);
        const last = notifications[notifications.length - 1];
        const nextCursor: NotificationCursorV2 | null = hasMore && last
            ? { beforeCreatedAt: last.createdAt, beforeId: last.id }
            : null;
        const page: NotificationPageV2 = { notifications, nextCursor };
        return { kind: "notifications", page };
    }

    async countUnreadOwn(input: { accountId: EntityId }): Promise<NotificationUnreadCountOutcome> {
        const rows = await this.persistence.sequelize.query<CountRow>(
            `SELECT COUNT(*) AS count
             FROM notifications
             INNER JOIN accounts ON accounts.id = notifications.recipient_account_id
             WHERE notifications.recipient_account_id = ?
               AND notifications.read_at IS NULL AND accounts.status = 'active'`,
            { replacements: [input.accountId], type: QueryTypes.SELECT },
        );
        return { kind: "unread_count", count: toUnreadCount(rows[0]?.count) };
    }

    async markOwnRead(input: {
        accountId: EntityId;
        notificationId: EntityId;
    }): Promise<NotificationMarkReadOutcome> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.markOwnReadLocked(input, transaction),
        ));
    }

    private async markOwnReadLocked(
        input: { accountId: EntityId; notificationId: EntityId },
        transaction: Transaction,
    ): Promise<NotificationMarkReadOutcome> {
        const rows = await this.persistence.sequelize.query<NotificationLockRow>(
            `SELECT notifications.id AS id, notifications.read_at AS readAt
             FROM notifications
             INNER JOIN accounts ON accounts.id = notifications.recipient_account_id
             WHERE notifications.id = ? AND notifications.recipient_account_id = ?
               AND accounts.status = 'active'
             FOR UPDATE`,
            {
                replacements: [input.notificationId, input.accountId],
                transaction,
                type: QueryTypes.SELECT,
            },
        );
        const notification = rows[0];
        if (!notification) return { kind: "notification_not_found" };
        serializeDatabaseEntityId(notification.id);
        if (notification.readAt !== null) {
            toTimestamp(notification.readAt, "read timestamp");
            return { kind: "already_read" };
        }
        await this.persistence.sequelize.query(
            "UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [input.notificationId], transaction, type: QueryTypes.UPDATE },
        );
        return { kind: "marked" };
    }
}
