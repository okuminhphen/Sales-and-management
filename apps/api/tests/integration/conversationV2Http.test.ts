import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ConversationMessageV2Service, type ConversationMessageV2Repository } from "../../src/modules/communication-ai/application/conversation-message-v2.service.js";
import { ConversationV2Service, type ConversationOpenV2Repository } from "../../src/modules/communication-ai/application/conversation-v2.service.js";
import { createConversationV2Router } from "../../src/modules/communication-ai/interfaces/http/conversation-v2.routes.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import type { V2HttpAuditEntry } from "../../src/observability/v2-http-audit.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "9007199254740993", customerId: "9007199254740994", employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};
const conversation = {
    id: serializeEntityId("9007199254740995"), customerId: serializeEntityId("9007199254740994"),
    status: "open" as const, replyMode: "bot" as const,
    createdAt: "2026-09-25T00:00:00.000Z", lastMessageAt: null,
};
const message = {
    id: serializeEntityId("9007199254740996"), conversationId: conversation.id,
    seq: "1", senderType: "customer" as const, content: "Xin chào",
    createdAt: "2026-09-25T00:00:01.000Z",
};

const setup = (authenticated = true) => {
    const openRepository: ConversationOpenV2Repository = {
        openOrGetActive: vi.fn(async () => ({ kind: "conversation" as const, conversation, created: true })),
    };
    const messageRepository: ConversationMessageV2Repository = {
        sendCustomerMessage: vi.fn(async () => ({ kind: "message" as const, message, replayed: false })),
        listCustomerMessages: vi.fn(async () => ({ kind: "messages" as const,
            page: { messages: [message], nextBeforeSeq: null } })),
    };
    const audits: V2HttpAuditEntry[] = [];
    const auth: RequestHandler = (req, _res, next) => {
        if (authenticated) (req as V2AuthenticatedRequest).v2AccessContext = context;
        next();
    };
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createConversationV2Router({ auth,
        conversation: new ConversationV2Service({ repository: openRepository }),
        messages: new ConversationMessageV2Service({ repository: messageRepository }),
        audit: (entry) => audits.push(entry),
    }));
    return { app, openRepository, messageRepository, audits };
};

describe("Conversation V2 HTTP compatibility", () => {
    it("opens the DB-derived customer's conversation and records only safe audit fields", async () => {
        const { app, openRepository, audits } = setup();
        const response = await request(app).post("/api/v1/conversation/create").expect(200);

        expect(response.body).toEqual({ EM: "Create conversation successfully", EC: 0,
            DT: { id: conversation.id, status: "open", replyMode: "bot", createdAt: conversation.createdAt,
                lastMessageAt: null, created: true } });
        expect(openRepository.openOrGetActive).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId), customerId: serializeEntityId(context.customerId!),
        });
        expect(audits).toEqual([{ action: "conversation.open", accountId: context.accountId,
            resourceId: conversation.id, requestId: null, statusCode: 200, outcome: "succeeded" }]);
    });

    it("validates a strict retryable message DTO before calling the common writer", async () => {
        const { app, messageRepository, audits } = setup();
        await request(app).post(`/api/v1/message/send/${conversation.id}`).send({
            clientMessageId: "message-1", message: "Xin chào", senderType: "staff",
        }).expect(400);
        expect(messageRepository.sendCustomerMessage).not.toHaveBeenCalled();

        const response = await request(app).post(`/api/v1/message/send/${conversation.id}`).send({
            clientMessageId: "message-1", message: "  Xin chào  ",
        }).expect(200);
        expect(response.body).toEqual({ EM: "Send message successfully", EC: 0,
            DT: { id: message.id, conversationId: conversation.id, seq: "1", senderType: "customer",
                message: "Xin chào", createdAt: message.createdAt, replayed: false } });
        expect(messageRepository.sendCustomerMessage).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId), customerId: serializeEntityId(context.customerId!),
            conversationId: conversation.id, dedupKey: "message-1", content: "Xin chào",
        });
        expect(audits).toContainEqual({ action: "conversation.message.send", accountId: context.accountId,
            resourceId: conversation.id, requestId: null, statusCode: 200, outcome: "succeeded" });
        expect(JSON.stringify(audits)).not.toContain("Xin chào");
    });

    it("reads only a bounded history and rejects malformed cursor/query fields", async () => {
        const { app, messageRepository } = setup();
        const response = await request(app)
            .get(`/api/v1/message/get/${conversation.id}?beforeSeq=42&limit=20`).expect(200);
        expect(response.body).toEqual({ EM: "Get messages successfully", EC: 0,
            DT: [{ id: message.id, conversationId: conversation.id, seq: "1", senderType: "customer",
                message: "Xin chào", createdAt: message.createdAt }], pagination: { nextBeforeSeq: null } });
        expect(messageRepository.listCustomerMessages).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId), customerId: serializeEntityId(context.customerId!),
            conversationId: conversation.id, beforeSeq: serializeEntityId("42"), limit: 20,
        });
        await request(app).get(`/api/v1/message/get/${conversation.id}?limit=101&senderType=staff`).expect(400);
        expect(messageRepository.listCustomerMessages).toHaveBeenCalledTimes(1);
    });

    it("requires the V2 context even when a router is composed incorrectly", async () => {
        const { app } = setup(false);
        await request(app).post("/api/v1/conversation/create").send({}).expect(401);
        await request(app).get(`/api/v1/message/get/${conversation.id}`).expect(401);
    });
});
