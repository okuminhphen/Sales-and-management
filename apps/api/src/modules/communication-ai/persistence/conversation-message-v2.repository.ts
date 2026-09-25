import { createHash } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import {
    serializeDatabaseEntityId,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import type {
    ConversationMessageV2Repository,
    CustomerMessageHistoryOutcome,
    CustomerMessageWriteOutcome,
    MessageHistoryPageV2,
    MessageViewV2,
} from "../application/conversation-message-v2.service.js";

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

type ConversationRow = { id: unknown; lastMessageSeq: unknown; status: unknown };
type MessageRow = {
    id: unknown;
    conversationId: unknown;
    seq: unknown;
    senderAccountId: unknown;
    senderType: unknown;
    requestHash?: unknown;
    content: unknown;
    createdAt: unknown;
};

type CustomerConversationInput = {
    accountId: EntityId;
    customerId: EntityId;
    conversationId: EntityId;
};

const toTimestamp = (value: unknown): string => {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) throw new TypeError("Database message timestamp is invalid.");
    return date.toISOString();
};

const toCounter = (value: unknown, field: string): bigint => {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Database ${field} is invalid.`);
        return BigInt(value);
    }
    if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) {
        throw new TypeError(`Database ${field} is invalid.`);
    }
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > MAX_SIGNED_BIGINT) throw new TypeError(`Database ${field} is invalid.`);
    return parsed;
};

const toMessage = (row: MessageRow): MessageViewV2 => {
    if (row.senderType !== "customer" && row.senderType !== "staff"
        && row.senderType !== "assistant" && row.senderType !== "system") {
        throw new TypeError("Database message sender type is invalid.");
    }
    if (typeof row.content !== "string" || row.content.trim().length === 0) {
        throw new TypeError("Database message content is invalid.");
    }
    const seq = toCounter(row.seq, "message sequence");
    if (seq <= 0n) throw new TypeError("Database message sequence is invalid.");
    return {
        id: serializeDatabaseEntityId(row.id),
        conversationId: serializeDatabaseEntityId(row.conversationId),
        seq: seq.toString(10),
        senderType: row.senderType,
        content: row.content,
        createdAt: toTimestamp(row.createdAt),
    };
};

const requestHash = (input: CustomerConversationInput & { content: string }): string => createHash("sha256")
    .update(JSON.stringify({
        senderType: "customer", accountId: input.accountId,
        conversationId: input.conversationId, content: input.content,
    }), "utf8")
    .digest("hex");

/** MySQL source-of-truth writer for V2 customer messages; it never broadcasts or starts AI work. */
export class SequelizeConversationMessageV2Repository implements ConversationMessageV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async sendCustomerMessage(input: CustomerConversationInput & {
        dedupKey: string;
        content: string;
    }): Promise<CustomerMessageWriteOutcome> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.sendCustomerMessageLocked(input, transaction),
        ));
    }

    async listCustomerMessages(input: CustomerConversationInput & {
        beforeSeq: EntityId | null;
        limit: number;
    }): Promise<CustomerMessageHistoryOutcome> {
        const conversation = await this.findOwnedConversation(input);
        if (!conversation) return { kind: "conversation_not_found" };
        const rows = await this.persistence.sequelize.query<MessageRow>(
            `SELECT id, conversation_id AS conversationId, seq, sender_account_id AS senderAccountId,
                    sender_type AS senderType, content, created_at AS createdAt
             FROM messages
             WHERE conversation_id = ? AND (? IS NULL OR seq < ?)
             ORDER BY seq DESC
             LIMIT ?`,
            { replacements: [input.conversationId, input.beforeSeq, input.beforeSeq, input.limit + 1], type: QueryTypes.SELECT },
        );
        const hasMore = rows.length > input.limit;
        const selected = rows.slice(0, input.limit).map(toMessage);
        const nextBeforeSeq = hasMore ? selected[selected.length - 1]?.seq ?? null : null;
        const page: MessageHistoryPageV2 = {
            messages: selected.reverse(),
            nextBeforeSeq,
        };
        return { kind: "messages", page };
    }

    private async sendCustomerMessageLocked(
        input: CustomerConversationInput & { dedupKey: string; content: string },
        transaction: Transaction,
    ): Promise<CustomerMessageWriteOutcome> {
        const conversation = await this.findOwnedConversation(input, transaction, true);
        if (!conversation) return { kind: "conversation_not_found" };
        if (conversation.status !== "open") return { kind: "conversation_not_sendable" };

        const hash = requestHash(input);
        const existing = await this.persistence.sequelize.query<MessageRow>(
            `SELECT id, conversation_id AS conversationId, seq, sender_account_id AS senderAccountId,
                    sender_type AS senderType, request_hash AS requestHash, content, created_at AS createdAt
             FROM messages WHERE conversation_id = ? AND dedup_key = ? FOR UPDATE`,
            { replacements: [input.conversationId, input.dedupKey], transaction, type: QueryTypes.SELECT },
        );
        if (existing[0]) {
            if (existing[0].senderType !== "customer" || String(existing[0].senderAccountId) !== input.accountId
                || existing[0].requestHash !== hash) return { kind: "deduplication_conflict" };
            return { kind: "message", message: toMessage(existing[0]), replayed: true };
        }

        const previousSeq = toCounter(conversation.lastMessageSeq, "conversation last message sequence");
        const nextSeq = previousSeq + 1n;
        if (nextSeq > MAX_SIGNED_BIGINT) throw new RangeError("Conversation sequence is exhausted.");
        await this.persistence.sequelize.query(
            `INSERT INTO messages (
                conversation_id, seq, sender_account_id, sender_type, message_type, dedup_key,
                request_hash, reply_to_message_id, content, metadata, created_at
             ) VALUES (?, ?, ?, 'customer', 'text', ?, ?, NULL, ?, NULL, UTC_TIMESTAMP(3))`,
            { replacements: [input.conversationId, nextSeq.toString(10), input.accountId, input.dedupKey, hash, input.content],
                transaction, type: QueryTypes.INSERT },
        );
        await this.persistence.sequelize.query(
            `UPDATE conversations
             SET last_message_seq = ?, last_message_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
             WHERE id = ?`,
            { replacements: [nextSeq.toString(10), input.conversationId], transaction, type: QueryTypes.UPDATE },
        );
        const stored = await this.persistence.sequelize.query<MessageRow>(
            `SELECT id, conversation_id AS conversationId, seq, sender_account_id AS senderAccountId,
                    sender_type AS senderType, content, created_at AS createdAt
             FROM messages WHERE conversation_id = ? AND dedup_key = ? FOR UPDATE`,
            { replacements: [input.conversationId, input.dedupKey], transaction, type: QueryTypes.SELECT },
        );
        if (!stored[0]) throw new Error("Database V2 did not persist the customer message.");
        return { kind: "message", message: toMessage(stored[0]), replayed: false };
    }

    private async findOwnedConversation(
        input: CustomerConversationInput,
        transaction?: Transaction,
        lock = false,
    ): Promise<ConversationRow | null> {
        const rows = await this.persistence.sequelize.query<ConversationRow>(
            `SELECT conversations.id AS id, conversations.last_message_seq AS lastMessageSeq, conversations.status AS status
             FROM conversations
             INNER JOIN customers ON customers.id = conversations.customer_id
             INNER JOIN accounts ON accounts.id = customers.account_id
             WHERE conversations.id = ? AND conversations.customer_id = ? AND customers.account_id = ?
               AND customers.status = 'active' AND accounts.status = 'active'
             ${lock ? "FOR UPDATE" : ""}`,
            { replacements: [input.conversationId, input.customerId, input.accountId], transaction, type: QueryTypes.SELECT },
        );
        return rows[0] ?? null;
    }
}
