import {
    DataTypes,
    Model,
    type Optional,
    type Sequelize,
} from "sequelize";
import {
    v2ModelOptions,
    type V2PersistenceModule,
} from "../../../database/v2/persistence.js";

type Timestamps = { createdAt: Date; updatedAt: Date };
type BigIntId = string;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ConversationStatus = "open" | "waiting_staff" | "closed";
type ReplyMode = "bot" | "human" | "paused";
type MessageSenderType = "customer" | "staff" | "assistant" | "system";
type AssistantRunStatus = "queued" | "generating" | "completed" | "failed" | "cancelled" | "superseded";

export type ConversationAttributes = Timestamps & {
    id: BigIntId; customerId: BigIntId; branchId: BigIntId | null; assignedAccountId: BigIntId | null;
    subject: string | null; status: ConversationStatus; replyMode: ReplyMode; version: BigIntId;
    lastMessageSeq: BigIntId; modeChangedByAccountId: BigIntId | null; modeChangedAt: Date;
    handoffRequestedAt: Date | null; lastMessageAt: Date | null; closedAt: Date | null;
};
export type MessageAttributes = {
    id: BigIntId; conversationId: BigIntId; seq: BigIntId; senderAccountId: BigIntId | null;
    senderType: MessageSenderType; messageType: "text" | "system_notice"; dedupKey: string;
    requestHash: string; replyToMessageId: BigIntId | null; content: string; metadata: JsonValue | null;
    createdAt: Date;
};
export type ConversationEventAttributes = {
    id: BigIntId; conversationId: BigIntId;
    eventType: "created" | "handoff_requested" | "claimed" | "assigned" | "routed" | "mode_changed" | "closed" | "reopened" | "assignee_released";
    actorAccountId: BigIntId | null; fromMode: ReplyMode | null; toMode: ReplyMode;
    fromAssigneeId: BigIntId | null; toAssigneeId: BigIntId | null; fromBranchId: BigIntId | null;
    toBranchId: BigIntId | null; fromStatus: ConversationStatus | null; toStatus: ConversationStatus;
    versionAfter: BigIntId; commandKey: string; requestHash: string; reasonCode: string | null; createdAt: Date;
};
export type ConversationReadStateAttributes = {
    conversationId: BigIntId; accountId: BigIntId; lastReadSeq: BigIntId; readAt: Date;
};
export type AssistantRunAttributes = {
    id: BigIntId; conversationId: BigIntId; triggerMessageId: BigIntId; expectedVersion: BigIntId;
    contextLastSeq: BigIntId; status: AssistantRunStatus; attemptCount: number; nextAttemptAt: Date | null;
    leaseToken: string | null; leaseExpiresAt: Date | null; responseMessageId: BigIntId | null;
    modelName: string | null; errorCode: string | null; createdAt: Date; startedAt: Date | null;
    completedAt: Date | null;
};
export type NotificationAttributes = {
    id: BigIntId; recipientAccountId: BigIntId; type: "order_new" | "order_updated" | "low_stock" | "stock_request" | "transfer_receipt" | "system";
    title: string; content: string; data: JsonValue | null; readAt: Date | null; createdAt: Date;
};
export type BehaviorEventAttributes = {
    id: BigIntId; customerId: BigIntId | null; anonymousSessionId: string | null; productId: BigIntId;
    eventType: "product_view" | "product_like" | "product_unlike" | "add_to_cart" | "purchase";
    eventData: JsonValue | null; occurredAt: Date; createdAt: Date;
};
export type CustomerProductStatAttributes = {
    id: BigIntId; customerId: BigIntId; productId: BigIntId; viewCount: number; isLiked: boolean;
    lastViewedAt: Date | null; updatedAt: Date;
};
export type OutboxEventAttributes = Timestamps & {
    id: BigIntId; eventId: string; eventType: string; aggregateType: string; aggregateId: string;
    payload: JsonValue; occurredAt: Date; publishedAt: Date | null; attempts: number; lockedAt: Date | null;
    lastError: string | null;
};

type New<Attributes extends { id: unknown }> = Optional<Attributes, "id">;
const bigintId = () => ({ type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true });
const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
};
const conversationStatus = () => DataTypes.ENUM("open", "waiting_staff", "closed");
const replyMode = () => DataTypes.ENUM("bot", "human", "paused");
const messageSenderType = () => DataTypes.ENUM("customer", "staff", "assistant", "system");
const assistantRunStatus = () => DataTypes.ENUM("queued", "generating", "completed", "failed", "cancelled", "superseded");

export const createCommunicationAiPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const Conversation = sequelize.define<Model<ConversationAttributes, New<ConversationAttributes>>>("Conversation", {
        id: bigintId(), customerId: { type: DataTypes.BIGINT, allowNull: false, field: "customer_id" },
        branchId: { type: DataTypes.BIGINT, allowNull: true, field: "branch_id" },
        assignedAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "assigned_account_id" },
        subject: { type: DataTypes.STRING(255), allowNull: true }, status: { type: conversationStatus(), allowNull: false },
        replyMode: { type: replyMode(), allowNull: false, field: "reply_mode" },
        version: { type: DataTypes.BIGINT, allowNull: false },
        lastMessageSeq: { type: DataTypes.BIGINT, allowNull: false, field: "last_message_seq" },
        modeChangedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "mode_changed_by_account_id" },
        modeChangedAt: { type: DataTypes.DATE, allowNull: false, field: "mode_changed_at" },
        handoffRequestedAt: { type: DataTypes.DATE, allowNull: true, field: "handoff_requested_at" },
        lastMessageAt: { type: DataTypes.DATE, allowNull: true, field: "last_message_at" },
        closedAt: { type: DataTypes.DATE, allowNull: true, field: "closed_at" }, ...timestamps,
    }, v2ModelOptions("conversations"));
    const Message = sequelize.define<Model<MessageAttributes, New<MessageAttributes>>>("Message", {
        id: bigintId(), conversationId: { type: DataTypes.BIGINT, allowNull: false, field: "conversation_id" },
        seq: { type: DataTypes.BIGINT, allowNull: false }, senderAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "sender_account_id" },
        senderType: { type: messageSenderType(), allowNull: false, field: "sender_type" },
        messageType: { type: DataTypes.ENUM("text", "system_notice"), allowNull: false, field: "message_type" },
        dedupKey: { type: DataTypes.STRING(191), allowNull: false, field: "dedup_key" },
        requestHash: { type: DataTypes.CHAR(64), allowNull: false, field: "request_hash" },
        replyToMessageId: { type: DataTypes.BIGINT, allowNull: true, field: "reply_to_message_id" },
        content: { type: DataTypes.TEXT, allowNull: false }, metadata: { type: DataTypes.JSON, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("messages"));
    const ConversationEvent = sequelize.define<Model<ConversationEventAttributes, New<ConversationEventAttributes>>>("ConversationEvent", {
        id: bigintId(), conversationId: { type: DataTypes.BIGINT, allowNull: false, field: "conversation_id" },
        eventType: { type: DataTypes.ENUM("created", "handoff_requested", "claimed", "assigned", "routed", "mode_changed", "closed", "reopened", "assignee_released"), allowNull: false, field: "event_type" },
        actorAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "actor_account_id" },
        fromMode: { type: replyMode(), allowNull: true, field: "from_mode" }, toMode: { type: replyMode(), allowNull: false, field: "to_mode" },
        fromAssigneeId: { type: DataTypes.BIGINT, allowNull: true, field: "from_assignee_id" },
        toAssigneeId: { type: DataTypes.BIGINT, allowNull: true, field: "to_assignee_id" },
        fromBranchId: { type: DataTypes.BIGINT, allowNull: true, field: "from_branch_id" },
        toBranchId: { type: DataTypes.BIGINT, allowNull: true, field: "to_branch_id" },
        fromStatus: { type: conversationStatus(), allowNull: true, field: "from_status" },
        toStatus: { type: conversationStatus(), allowNull: false, field: "to_status" },
        versionAfter: { type: DataTypes.BIGINT, allowNull: false, field: "version_after" },
        commandKey: { type: DataTypes.STRING(191), allowNull: false, field: "command_key" },
        requestHash: { type: DataTypes.CHAR(64), allowNull: false, field: "request_hash" },
        reasonCode: { type: DataTypes.STRING(100), allowNull: true, field: "reason_code" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("conversation_events"));
    const ConversationReadState = sequelize.define<Model<ConversationReadStateAttributes, ConversationReadStateAttributes>>("ConversationReadState", {
        conversationId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, field: "conversation_id" },
        accountId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, field: "account_id" },
        lastReadSeq: { type: DataTypes.BIGINT, allowNull: false, field: "last_read_seq" },
        readAt: { type: DataTypes.DATE, allowNull: false, field: "read_at" },
    }, v2ModelOptions("conversation_read_states"));
    const AssistantRun = sequelize.define<Model<AssistantRunAttributes, New<AssistantRunAttributes>>>("AssistantRun", {
        id: bigintId(), conversationId: { type: DataTypes.BIGINT, allowNull: false, field: "conversation_id" },
        triggerMessageId: { type: DataTypes.BIGINT, allowNull: false, field: "trigger_message_id" },
        expectedVersion: { type: DataTypes.BIGINT, allowNull: false, field: "expected_version" },
        contextLastSeq: { type: DataTypes.BIGINT, allowNull: false, field: "context_last_seq" },
        status: { type: assistantRunStatus(), allowNull: false }, attemptCount: { type: DataTypes.INTEGER, allowNull: false, field: "attempt_count" },
        nextAttemptAt: { type: DataTypes.DATE, allowNull: true, field: "next_attempt_at" },
        leaseToken: { type: DataTypes.CHAR(36), allowNull: true, field: "lease_token" },
        leaseExpiresAt: { type: DataTypes.DATE, allowNull: true, field: "lease_expires_at" },
        responseMessageId: { type: DataTypes.BIGINT, allowNull: true, field: "response_message_id" },
        modelName: { type: DataTypes.STRING(150), allowNull: true, field: "model_name" },
        errorCode: { type: DataTypes.STRING(100), allowNull: true, field: "error_code" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
        startedAt: { type: DataTypes.DATE, allowNull: true, field: "started_at" },
        completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
    }, v2ModelOptions("assistant_runs"));
    const Notification = sequelize.define<Model<NotificationAttributes, New<NotificationAttributes>>>("Notification", {
        id: bigintId(), recipientAccountId: { type: DataTypes.BIGINT, allowNull: false, field: "recipient_account_id" },
        type: { type: DataTypes.ENUM("order_new", "order_updated", "low_stock", "stock_request", "transfer_receipt", "system"), allowNull: false },
        title: { type: DataTypes.STRING(255), allowNull: false }, content: { type: DataTypes.STRING(1000), allowNull: false },
        data: { type: DataTypes.JSON, allowNull: true }, readAt: { type: DataTypes.DATE, allowNull: true, field: "read_at" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("notifications"));

    return {
        name: "communication-ai",
        models: [
            { name: "Conversation", model: Conversation }, { name: "Message", model: Message },
            { name: "ConversationEvent", model: ConversationEvent }, { name: "ConversationReadState", model: ConversationReadState },
            { name: "AssistantRun", model: AssistantRun }, { name: "Notification", model: Notification },
        ],
        associate: () => {
            Conversation.hasMany(Message, { foreignKey: "conversationId", as: "messages" });
            Message.belongsTo(Conversation, { foreignKey: "conversationId", as: "conversation" });
            Message.belongsTo(Message, { foreignKey: "replyToMessageId", as: "replyTo" });
            Message.hasMany(Message, { foreignKey: "replyToMessageId", as: "replies" });
            Conversation.hasMany(ConversationEvent, { foreignKey: "conversationId", as: "events" });
            ConversationEvent.belongsTo(Conversation, { foreignKey: "conversationId", as: "conversation" });
            Conversation.hasMany(ConversationReadState, { foreignKey: "conversationId", as: "readStates" });
            ConversationReadState.belongsTo(Conversation, { foreignKey: "conversationId", as: "conversation" });
            Conversation.hasMany(AssistantRun, { foreignKey: "conversationId", as: "assistantRuns" });
            AssistantRun.belongsTo(Conversation, { foreignKey: "conversationId", as: "conversation" });
            Message.hasOne(AssistantRun, { foreignKey: "triggerMessageId", as: "triggeredAssistantRun" });
            AssistantRun.belongsTo(Message, { foreignKey: "triggerMessageId", as: "triggerMessage" });
            Message.hasOne(AssistantRun, { foreignKey: "responseMessageId", as: "responseAssistantRun" });
            AssistantRun.belongsTo(Message, { foreignKey: "responseMessageId", as: "responseMessage" });
        },
    };
};

export const createPersonalizationPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const BehaviorEvent = sequelize.define<Model<BehaviorEventAttributes, New<BehaviorEventAttributes>>>("BehaviorEvent", {
        id: bigintId(), customerId: { type: DataTypes.BIGINT, allowNull: true, field: "customer_id" },
        anonymousSessionId: { type: DataTypes.STRING(100), allowNull: true, field: "anonymous_session_id" },
        productId: { type: DataTypes.BIGINT, allowNull: false, field: "product_id" },
        eventType: { type: DataTypes.ENUM("product_view", "product_like", "product_unlike", "add_to_cart", "purchase"), allowNull: false, field: "event_type" },
        eventData: { type: DataTypes.JSON, allowNull: true, field: "event_data" },
        occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("behavior_events"));
    const CustomerProductStat = sequelize.define<Model<CustomerProductStatAttributes, New<CustomerProductStatAttributes>>>("CustomerProductStat", {
        id: bigintId(), customerId: { type: DataTypes.BIGINT, allowNull: false, field: "customer_id" },
        productId: { type: DataTypes.BIGINT, allowNull: false, field: "product_id" },
        viewCount: { type: DataTypes.INTEGER, allowNull: false, field: "view_count" },
        isLiked: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_liked" },
        lastViewedAt: { type: DataTypes.DATE, allowNull: true, field: "last_viewed_at" },
        updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
    }, v2ModelOptions("customer_product_stats"));
    return {
        name: "personalization",
        models: [{ name: "BehaviorEvent", model: BehaviorEvent }, { name: "CustomerProductStat", model: CustomerProductStat }],
    };
};

export const createOutboxPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const OutboxEvent = sequelize.define<Model<OutboxEventAttributes, New<OutboxEventAttributes>>>("OutboxEvent", {
        id: bigintId(), eventId: { type: DataTypes.CHAR(36), allowNull: false, field: "event_id" },
        eventType: { type: DataTypes.STRING(100), allowNull: false, field: "event_type" },
        aggregateType: { type: DataTypes.STRING(100), allowNull: false, field: "aggregate_type" },
        aggregateId: { type: DataTypes.STRING(100), allowNull: false, field: "aggregate_id" },
        payload: { type: DataTypes.JSON, allowNull: false }, occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
        publishedAt: { type: DataTypes.DATE, allowNull: true, field: "published_at" }, attempts: { type: DataTypes.INTEGER, allowNull: false },
        lockedAt: { type: DataTypes.DATE, allowNull: true, field: "locked_at" }, lastError: { type: DataTypes.TEXT, allowNull: true, field: "last_error" },
        ...timestamps,
    }, v2ModelOptions("outbox_events"));
    return { name: "outbox", models: [{ name: "OutboxEvent", model: OutboxEvent }] };
};
