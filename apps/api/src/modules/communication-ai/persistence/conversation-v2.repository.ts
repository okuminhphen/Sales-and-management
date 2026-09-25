import { createHash } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import type {
    ConversationOpenV2Outcome,
    ConversationOpenV2Repository,
    ConversationViewV2,
} from "../application/conversation-v2.service.js";

type CustomerRow = { id: unknown };
type ConversationRow = {
    id: unknown;
    customerId: unknown;
    status: unknown;
    replyMode: unknown;
    createdAt: unknown;
    lastMessageAt: unknown;
};

const toTimestamp = (value: unknown): string => {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        throw new TypeError("Database conversation timestamp is invalid.");
    }
    return date.toISOString();
};

const toConversation = (row: ConversationRow): ConversationViewV2 => {
    if ((row.status !== "open" && row.status !== "waiting_staff")
        || (row.replyMode !== "bot" && row.replyMode !== "human" && row.replyMode !== "paused")) {
        throw new TypeError("Database conversation state is invalid.");
    }
    return {
        id: serializeDatabaseEntityId(row.id),
        customerId: serializeDatabaseEntityId(row.customerId),
        status: row.status,
        replyMode: row.replyMode,
        createdAt: toTimestamp(row.createdAt),
        lastMessageAt: row.lastMessageAt === null ? null : toTimestamp(row.lastMessageAt),
    };
};

const creationRequestHash = (customerId: EntityId): string => createHash("sha256")
    .update(`conversation.open.v2:${customerId}`, "utf8")
    .digest("hex");

/**
 * MySQL adapter serializes the active-conversation invariant with a locked
 * customer row. V2 does not share this writer with legacy conversations.
 */
export class SequelizeConversationOpenV2Repository implements ConversationOpenV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async openOrGetActive(input: { accountId: EntityId; customerId: EntityId }): Promise<ConversationOpenV2Outcome> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.openOrGetActiveLocked(input, transaction),
        ));
    }

    private async openOrGetActiveLocked(
        input: { accountId: EntityId; customerId: EntityId },
        transaction: Transaction,
    ): Promise<ConversationOpenV2Outcome> {
        const sql = this.persistence.sequelize;
        const customers = await sql.query<CustomerRow>(
            `SELECT customers.id AS id
             FROM customers
             INNER JOIN accounts ON accounts.id = customers.account_id
             WHERE customers.id = ? AND customers.account_id = ?
               AND customers.status = 'active' AND accounts.status = 'active'
             FOR UPDATE`,
            { replacements: [input.customerId, input.accountId], transaction, type: QueryTypes.SELECT },
        );
        if (!customers[0]) return { kind: "customer_unavailable" };

        const active = await sql.query<ConversationRow>(
            `SELECT id, customer_id AS customerId, status, reply_mode AS replyMode,
                    created_at AS createdAt, last_message_at AS lastMessageAt
             FROM conversations
             WHERE customer_id = ? AND status IN ('open', 'waiting_staff')
             ORDER BY created_at DESC, id DESC
             LIMIT 2 FOR UPDATE`,
            { replacements: [input.customerId], transaction, type: QueryTypes.SELECT },
        );
        if (active.length > 1) return { kind: "active_conversation_integrity_error" };
        if (active[0]) return { kind: "conversation", conversation: toConversation(active[0]), created: false };

        await sql.query(
            `INSERT INTO conversations (
                customer_id, branch_id, assigned_account_id, subject, status, reply_mode,
                version, last_message_seq, mode_changed_by_account_id, mode_changed_at,
                handoff_requested_at, last_message_at, closed_at, created_at, updated_at
             ) VALUES (?, NULL, NULL, NULL, 'open', 'bot', 0, 0, ?, UTC_TIMESTAMP(3),
                NULL, NULL, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [input.customerId, input.accountId], transaction, type: QueryTypes.INSERT },
        );
        const created = await sql.query<ConversationRow>(
            `SELECT id, customer_id AS customerId, status, reply_mode AS replyMode,
                    created_at AS createdAt, last_message_at AS lastMessageAt
             FROM conversations WHERE customer_id = ? AND status = 'open'
             ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
            { replacements: [input.customerId], transaction, type: QueryTypes.SELECT },
        );
        if (!created[0]) throw new Error("Database V2 did not persist the conversation.");
        const conversation = toConversation(created[0]);
        await sql.query(
            `INSERT INTO conversation_events (
                conversation_id, event_type, actor_account_id, from_mode, to_mode,
                from_assignee_id, to_assignee_id, from_branch_id, to_branch_id,
                from_status, to_status, version_after, command_key, request_hash,
                reason_code, created_at
             ) VALUES (?, 'created', ?, NULL, 'bot', NULL, NULL, NULL, NULL,
                NULL, 'open', 0, 'conversation.open.v2', ?, NULL, UTC_TIMESTAMP(3))`,
            { replacements: [conversation.id, input.accountId, creationRequestHash(input.customerId)], transaction,
                type: QueryTypes.INSERT },
        );
        return { kind: "conversation", conversation, created: true };
    }
}
