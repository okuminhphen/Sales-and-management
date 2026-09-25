import { createHash } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import {
    serializeDatabaseEntityId,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import type {
    ConversationHandoffV2Repository,
    ConversationHandoffViewV2,
    CustomerHandoffOutcome,
} from "../application/conversation-handoff-v2.service.js";

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

type CustomerConversationInput = {
    accountId: EntityId;
    customerId: EntityId;
    conversationId: EntityId;
};

type ConversationRow = {
    id: unknown;
    branchId: unknown;
    assignedAccountId: unknown;
    status: unknown;
    replyMode: unknown;
    version: unknown;
    handoffRequestedAt: unknown;
};

type EventRow = { actorAccountId: unknown; eventType: unknown; requestHash: unknown };

const toTimestamp = (value: unknown): string => {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) throw new TypeError("Database handoff timestamp is invalid.");
    return date.toISOString();
};

const toVersion = (value: unknown): string => {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Database conversation version is invalid.");
        return BigInt(value).toString(10);
    }
    if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) {
        throw new TypeError("Database conversation version is invalid.");
    }
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > MAX_SIGNED_BIGINT) {
        throw new TypeError("Database conversation version is invalid.");
    }
    return parsed.toString(10);
};

const toConversation = (row: ConversationRow): ConversationHandoffViewV2 => {
    if ((row.status !== "open" && row.status !== "waiting_staff" && row.status !== "closed")
        || (row.replyMode !== "bot" && row.replyMode !== "human" && row.replyMode !== "paused")) {
        throw new TypeError("Database conversation state is invalid.");
    }
    const handoffRequestedAt = row.handoffRequestedAt === null ? null : toTimestamp(row.handoffRequestedAt);
    if (row.status === "waiting_staff" && (row.replyMode !== "paused" || handoffRequestedAt === null)) {
        throw new TypeError("Database waiting-staff conversation state is invalid.");
    }
    return {
        id: serializeDatabaseEntityId(row.id),
        status: row.status,
        replyMode: row.replyMode,
        version: toVersion(row.version),
        handoffRequestedAt,
    };
};

const requestHash = (input: CustomerConversationInput & { expectedVersion: string }): string => createHash("sha256")
    .update(JSON.stringify({
        action: "conversation.request_staff.v2",
        accountId: input.accountId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        expectedVersion: input.expectedVersion,
    }), "utf8")
    .digest("hex");

/**
 * Persists the customer request under the conversation row lock. No transport
 * side effect leaves this transaction; notification and Socket delivery are
 * separate later slices and must consume only a committed state.
 */
export class SequelizeConversationHandoffV2Repository implements ConversationHandoffV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async requestCustomerHandoff(input: CustomerConversationInput & {
        commandKey: string;
        expectedVersion: string;
    }): Promise<CustomerHandoffOutcome> {
        return retryV2Transaction(() => this.persistence.inTransaction((transaction) =>
            this.requestCustomerHandoffLocked(input, transaction),
        ));
    }

    private async requestCustomerHandoffLocked(
        input: CustomerConversationInput & { commandKey: string; expectedVersion: string },
        transaction: Transaction,
    ): Promise<CustomerHandoffOutcome> {
        const conversation = await this.findOwnedConversation(input, transaction, true);
        if (!conversation) return { kind: "conversation_not_found" };

        const hash = requestHash(input);
        const command = await this.persistence.sequelize.query<EventRow>(
            `SELECT actor_account_id AS actorAccountId, event_type AS eventType, request_hash AS requestHash
             FROM conversation_events
             WHERE conversation_id = ? AND command_key = ?
             FOR UPDATE`,
            { replacements: [input.conversationId, input.commandKey], transaction, type: QueryTypes.SELECT },
        );
        if (command[0]) {
            if (command[0].eventType !== "handoff_requested"
                || serializeDatabaseEntityId(command[0].actorAccountId) !== input.accountId
                || command[0].requestHash !== hash) {
                return { kind: "command_conflict" };
            }
            return { kind: "handoff_requested", handoff: toConversation(conversation), replayed: true };
        }

        const current = toConversation(conversation);
        if (current.version !== input.expectedVersion) return { kind: "version_conflict" };
        if (current.status !== "open" || (current.replyMode !== "bot" && current.replyMode !== "paused")) {
            return { kind: "conversation_not_requestable" };
        }
        const fromAssigneeId = conversation.assignedAccountId === null
            ? null : serializeDatabaseEntityId(conversation.assignedAccountId);
        const branchId = conversation.branchId === null
            ? null : serializeDatabaseEntityId(conversation.branchId);
        const nextVersion = BigInt(current.version) + 1n;
        if (nextVersion > MAX_SIGNED_BIGINT) throw new RangeError("Conversation version is exhausted.");

        await this.persistence.sequelize.query(
            `UPDATE conversations
             SET assigned_account_id = NULL, status = 'waiting_staff', reply_mode = 'paused',
                 version = ?, mode_changed_by_account_id = ?, mode_changed_at = UTC_TIMESTAMP(3),
                 handoff_requested_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND version = ?`,
            { replacements: [nextVersion.toString(10), input.accountId, input.conversationId, current.version],
                transaction, type: QueryTypes.UPDATE },
        );
        await this.persistence.sequelize.query(
            `INSERT INTO conversation_events (
                conversation_id, event_type, actor_account_id, from_mode, to_mode,
                from_assignee_id, to_assignee_id, from_branch_id, to_branch_id,
                from_status, to_status, version_after, command_key, request_hash,
                reason_code, created_at
             ) VALUES (?, 'handoff_requested', ?, ?, 'paused', ?, NULL, ?, ?,
                'open', 'waiting_staff', ?, ?, ?, NULL, UTC_TIMESTAMP(3))`,
            { replacements: [input.conversationId, input.accountId, current.replyMode, fromAssigneeId,
                branchId, branchId, nextVersion.toString(10), input.commandKey, hash],
                transaction, type: QueryTypes.INSERT },
        );
        const updated = await this.findOwnedConversation(input, transaction, true);
        if (!updated) throw new Error("Database V2 lost the customer conversation after a handoff request.");
        return { kind: "handoff_requested", handoff: toConversation(updated), replayed: false };
    }

    private async findOwnedConversation(
        input: CustomerConversationInput,
        transaction: Transaction,
        lock: boolean,
    ): Promise<ConversationRow | null> {
        const rows = await this.persistence.sequelize.query<ConversationRow>(
            `SELECT conversations.id AS id, conversations.branch_id AS branchId,
                    conversations.assigned_account_id AS assignedAccountId, conversations.status AS status,
                    conversations.reply_mode AS replyMode, conversations.version AS version,
                    conversations.handoff_requested_at AS handoffRequestedAt
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
