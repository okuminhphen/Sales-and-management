import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

const MAX_MESSAGE_LENGTH = 5_000;
const MAX_HISTORY_LIMIT = 100;
const defaultHistoryLimit = 50;

export type MessageViewV2 = {
    id: EntityId;
    conversationId: EntityId;
    seq: string;
    senderType: "customer" | "staff" | "assistant" | "system";
    content: string;
    createdAt: string;
};

export type MessageHistoryPageV2 = {
    messages: readonly MessageViewV2[];
    nextBeforeSeq: string | null;
};

type CustomerConversationIdentity = {
    accountId: EntityId;
    customerId: EntityId;
    conversationId: EntityId;
};

export type CustomerMessageWriteOutcome =
    | { kind: "message"; message: MessageViewV2; replayed: boolean }
    | { kind: "conversation_not_found" | "conversation_not_sendable" | "deduplication_conflict" };
export type CustomerMessageHistoryOutcome =
    | { kind: "messages"; page: MessageHistoryPageV2 }
    | { kind: "conversation_not_found" };

export interface ConversationMessageV2Repository {
    sendCustomerMessage: (input: CustomerConversationIdentity & {
        dedupKey: string;
        content: string;
    }) => Promise<CustomerMessageWriteOutcome>;
    listCustomerMessages: (input: CustomerConversationIdentity & {
        beforeSeq: EntityId | null;
        limit: number;
    }) => Promise<CustomerMessageHistoryOutcome>;
}

export type CustomerMessageSendResult = CustomerMessageWriteOutcome
    | { kind: "customer_profile_required" | "invalid_message" | "message_unavailable" }
    | { kind: "message_deduplication_conflict" };
export type CustomerMessageHistoryResult = CustomerMessageHistoryOutcome
    | { kind: "customer_profile_required" | "invalid_message_history" | "message_history_unavailable" };

const normalizeDedupKey = (value: unknown): string | null =>
    typeof value === "string" && /^[A-Za-z0-9._:-]{1,191}$/.test(value) ? value : null;

const normalizeContent = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const content = value.trim();
    return content.length > 0 && content.length <= MAX_MESSAGE_LENGTH ? content : null;
};

const normalizeHistoryQuery = (input: { beforeSeq?: unknown; limit?: unknown } | undefined): {
    beforeSeq: EntityId | null;
    limit: number;
} | null => {
    const limit = input?.limit === undefined ? defaultHistoryLimit : input.limit;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit)
        || limit < 1 || limit > MAX_HISTORY_LIMIT) return null;
    if (input?.beforeSeq === undefined || input.beforeSeq === null) return { beforeSeq: null, limit };
    try {
        return { beforeSeq: serializeEntityId(input.beforeSeq), limit };
    } catch {
        return null;
    }
};

/** Shared customer message/history boundary. REST and Socket adapters will call this one writer. */
export class ConversationMessageV2Service {
    constructor(private readonly dependencies: { repository: ConversationMessageV2Repository }) {}

    async sendOwn(context: V2AccessContext, input: {
        conversationId: unknown;
        clientMessageId: unknown;
        content: unknown;
    }): Promise<CustomerMessageSendResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        const dedupKey = normalizeDedupKey(input.clientMessageId);
        const content = normalizeContent(input.content);
        let identity: CustomerConversationIdentity;
        try {
            identity = {
                accountId: serializeEntityId(context.accountId),
                customerId: serializeEntityId(context.customerId),
                conversationId: serializeEntityId(input.conversationId),
            };
        } catch {
            return { kind: "invalid_message" };
        }
        if (!dedupKey || !content) return { kind: "invalid_message" };
        try {
            const outcome = await this.dependencies.repository.sendCustomerMessage({ ...identity, dedupKey, content });
            if (outcome.kind === "deduplication_conflict") return { kind: "message_deduplication_conflict" };
            return outcome;
        } catch {
            return { kind: "message_unavailable" };
        }
    }

    async listOwn(
        context: V2AccessContext,
        conversationId: unknown,
        input?: { beforeSeq?: unknown; limit?: unknown },
    ): Promise<CustomerMessageHistoryResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        const query = normalizeHistoryQuery(input);
        if (!query) return { kind: "invalid_message_history" };
        let identity: CustomerConversationIdentity;
        try {
            identity = {
                accountId: serializeEntityId(context.accountId),
                customerId: serializeEntityId(context.customerId),
                conversationId: serializeEntityId(conversationId),
            };
        } catch {
            return { kind: "invalid_message_history" };
        }
        try {
            return await this.dependencies.repository.listCustomerMessages({ ...identity, ...query });
        } catch {
            return { kind: "message_history_unavailable" };
        }
    }
}
