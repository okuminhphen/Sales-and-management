import { describe, expect, it, vi } from "vitest";
import {
    ConversationMessageV2Service,
    type ConversationMessageV2Repository,
    type MessageHistoryPageV2,
    type MessageViewV2,
} from "../../src/modules/communication-ai/application/conversation-message-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const context: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const message: MessageViewV2 = {
    id: serializeEntityId("9007199254740996"),
    conversationId: serializeEntityId("9007199254740995"),
    seq: "1",
    senderType: "customer",
    content: "Tôi cần tư vấn sản phẩm",
    createdAt: "2026-09-25T00:00:00.000Z",
};

const history: MessageHistoryPageV2 = {
    messages: [message],
    nextBeforeSeq: null,
};

const repository = (): ConversationMessageV2Repository => ({
    sendCustomerMessage: vi.fn(async () => ({ kind: "message" as const, message, replayed: false })),
    listCustomerMessages: vi.fn(async () => ({ kind: "messages" as const, page: history })),
});

describe("ConversationMessageV2Service", () => {
    it("uses only the authenticated customer and canonicalizes a retryable customer message", async () => {
        const store = repository();
        const service = new ConversationMessageV2Service({ repository: store });

        await expect(service.sendOwn(context, {
            conversationId: "9007199254740995", clientMessageId: "client-message-1",
            content: "  Tôi cần tư vấn sản phẩm  ",
        })).resolves.toEqual({ kind: "message", message, replayed: false });
        expect(store.sendCustomerMessage).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId),
            customerId: serializeEntityId(context.customerId!),
            conversationId: serializeEntityId("9007199254740995"),
            dedupKey: "client-message-1",
            content: "Tôi cần tư vấn sản phẩm",
        });
    });

    it("rejects forged identity, malformed message input and unsafe history cursors before persistence", async () => {
        const store = repository();
        const service = new ConversationMessageV2Service({ repository: store });

        await expect(service.sendOwn({ ...context, customerId: null }, {
            conversationId: "9007199254740995", clientMessageId: "client-message-1", content: "Xin chào",
        })).resolves.toEqual({ kind: "customer_profile_required" });
        await expect(service.sendOwn(context, {
            conversationId: 1, clientMessageId: "bad key with spaces", content: "   ",
        })).resolves.toEqual({ kind: "invalid_message" });
        await expect(service.listOwn(context, "9007199254740995", {
            beforeSeq: "900719925474099300000", limit: 101,
        })).resolves.toEqual({ kind: "invalid_message_history" });
        expect(store.sendCustomerMessage).not.toHaveBeenCalled();
        expect(store.listCustomerMessages).not.toHaveBeenCalled();
    });

    it("returns a bounded, customer-scoped history page", async () => {
        const store = repository();
        const service = new ConversationMessageV2Service({ repository: store });

        await expect(service.listOwn(context, "9007199254740995", { beforeSeq: "42", limit: 20 }))
            .resolves.toEqual({ kind: "messages", page: history });
        expect(store.listCustomerMessages).toHaveBeenCalledWith({
            accountId: serializeEntityId(context.accountId),
            customerId: serializeEntityId(context.customerId!),
            conversationId: serializeEntityId("9007199254740995"),
            beforeSeq: serializeEntityId("42"),
            limit: 20,
        });
    });

    it("maps storage outcomes to stable non-sensitive results", async () => {
        const store = repository();
        vi.mocked(store.sendCustomerMessage).mockResolvedValueOnce({ kind: "deduplication_conflict" });
        vi.mocked(store.listCustomerMessages).mockResolvedValueOnce({ kind: "conversation_not_found" });
        const service = new ConversationMessageV2Service({ repository: store });

        await expect(service.sendOwn(context, {
            conversationId: "9007199254740995", clientMessageId: "client-message-1", content: "Xin chào",
        })).resolves.toEqual({ kind: "message_deduplication_conflict" });
        await expect(service.listOwn(context, "9007199254740995"))
            .resolves.toEqual({ kind: "conversation_not_found" });
        vi.mocked(store.listCustomerMessages).mockRejectedValueOnce(new Error("database detail"));
        await expect(service.listOwn(context, "9007199254740995"))
            .resolves.toEqual({ kind: "message_history_unavailable" });
    });
});
