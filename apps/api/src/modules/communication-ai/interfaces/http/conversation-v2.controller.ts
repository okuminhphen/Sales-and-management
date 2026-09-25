import type { RequestHandler } from "express";
import type { ConversationMessageV2Service, MessageViewV2 } from "../../application/conversation-message-v2.service.js";
import type { ConversationV2Service, ConversationViewV2 } from "../../application/conversation-v2.service.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

const displayConversation = (conversation: ConversationViewV2, created: boolean) => ({
    id: conversation.id,
    status: conversation.status,
    replyMode: conversation.replyMode,
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    created,
});

const displayMessage = (message: MessageViewV2) => ({
    id: message.id,
    conversationId: message.conversationId,
    seq: message.seq,
    senderType: message.senderType,
    message: message.content,
    createdAt: message.createdAt,
});

const contextOf = (request: Parameters<RequestHandler>[0]) =>
    (request as V2AuthenticatedRequest).v2AccessContext;

/** Translates V2 chat outcomes to the legacy envelope without exposing audit/internal fields. */
export const createConversationV2Controller = (dependencies: {
    conversation: ConversationV2Service;
    messages: ConversationMessageV2Service;
}): { open: RequestHandler; send: RequestHandler; history: RequestHandler } => ({
    open: async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            return;
        }
        const result = await dependencies.conversation.openOwn(context);
        switch (result.kind) {
            case "conversation":
                response.locals.auditResourceId = result.conversation.id;
                response.status(200).json({ EM: "Create conversation successfully", EC: 0,
                    DT: displayConversation(result.conversation, result.created) });
                return;
            case "customer_profile_required":
                response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null }); return;
            case "conversation_unavailable":
                response.status(503).json({ EM: "Conversation service unavailable", EC: -1, DT: null }); return;
        }
    },
    send: async (request, response) => {
        response.locals.auditResourceId = request.params.conversationId;
        const context = contextOf(request);
        if (!context) {
            response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            return;
        }
        const result = await dependencies.messages.sendOwn(context, {
            conversationId: request.params.conversationId,
            clientMessageId: request.body.clientMessageId,
            content: request.body.message,
        });
        switch (result.kind) {
            case "message":
                response.status(200).json({ EM: "Send message successfully", EC: 0,
                    DT: { ...displayMessage(result.message), replayed: result.replayed } });
                return;
            case "conversation_not_found":
                response.status(404).json({ EM: "Conversation not found", EC: 1, DT: null }); return;
            case "conversation_not_sendable":
                response.status(409).json({ EM: "Conversation cannot receive messages", EC: 1, DT: null }); return;
            case "message_deduplication_conflict":
                response.status(409).json({ EM: "Message retry conflict", EC: 1, DT: null }); return;
            case "customer_profile_required":
                response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null }); return;
            case "invalid_message":
                response.status(400).json({ EM: "Invalid message", EC: 1, DT: null }); return;
            case "message_unavailable":
                response.status(503).json({ EM: "Message service unavailable", EC: -1, DT: null }); return;
        }
    },
    history: async (request, response) => {
        const context = contextOf(request);
        if (!context) {
            response.status(401).json({ EM: "Authentication required", EC: 3, DT: [] });
            return;
        }
        const result = await dependencies.messages.listOwn(context, request.params.conversationId, request.query);
        switch (result.kind) {
            case "messages":
                response.status(200).json({ EM: "Get messages successfully", EC: 0,
                    DT: result.page.messages.map(displayMessage),
                    pagination: { nextBeforeSeq: result.page.nextBeforeSeq } });
                return;
            case "conversation_not_found":
                response.status(404).json({ EM: "Conversation not found", EC: 1, DT: [] }); return;
            case "customer_profile_required":
                response.status(403).json({ EM: "Customer identity required", EC: 3, DT: [] }); return;
            case "invalid_message_history":
                response.status(400).json({ EM: "Invalid message history query", EC: 1, DT: [] }); return;
            case "message_history_unavailable":
                response.status(503).json({ EM: "Message service unavailable", EC: -1, DT: [] }); return;
        }
    },
});
