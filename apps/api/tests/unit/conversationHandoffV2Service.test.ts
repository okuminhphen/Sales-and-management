import { describe, expect, it, vi } from "vitest";
import {
    ConversationHandoffV2Service,
    type ConversationHandoffV2Repository,
    type ConversationHandoffViewV2,
} from "../../src/modules/communication-ai/application/conversation-handoff-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const customerContext: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const handoff: ConversationHandoffViewV2 = {
    id: serializeEntityId("9007199254740995"),
    status: "waiting_staff",
    replyMode: "paused",
    version: "1",
    handoffRequestedAt: "2026-09-25T00:00:00.000Z",
};

const repository = (): ConversationHandoffV2Repository => ({
    requestCustomerHandoff: vi.fn(async () => ({ kind: "handoff_requested" as const, handoff, replayed: false })),
});

describe("ConversationHandoffV2Service", () => {
    it("derives the customer identity from the DB-derived context and canonicalizes the command", async () => {
        const store = repository();
        const service = new ConversationHandoffV2Service({ repository: store });

        await expect(service.requestHumanOwn(customerContext, {
            conversationId: "9007199254740995", commandKey: "handoff-1", expectedVersion: "0001",
        })).resolves.toEqual({ kind: "handoff_requested", handoff, replayed: false });
        expect(store.requestCustomerHandoff).toHaveBeenCalledWith({
            accountId: serializeEntityId(customerContext.accountId),
            customerId: serializeEntityId(customerContext.customerId!),
            conversationId: serializeEntityId("9007199254740995"),
            commandKey: "handoff-1",
            expectedVersion: "1",
        });
    });

    it("rejects forged or malformed control input before it reaches persistence", async () => {
        const store = repository();
        const service = new ConversationHandoffV2Service({ repository: store });

        await expect(service.requestHumanOwn({ ...customerContext, customerId: null }, {
            conversationId: "9007199254740995", commandKey: "handoff-1", expectedVersion: "0",
        })).resolves.toEqual({ kind: "customer_profile_required" });
        await expect(service.requestHumanOwn(customerContext, {
            conversationId: 1, commandKey: "invalid key", expectedVersion: 0,
        })).resolves.toEqual({ kind: "invalid_handoff_request" });
        expect(store.requestCustomerHandoff).not.toHaveBeenCalled();
    });

    it("preserves conflict semantics without leaking storage details", async () => {
        const store = repository();
        vi.mocked(store.requestCustomerHandoff).mockResolvedValueOnce({ kind: "command_conflict" });
        vi.mocked(store.requestCustomerHandoff).mockResolvedValueOnce({ kind: "version_conflict" });
        vi.mocked(store.requestCustomerHandoff).mockResolvedValueOnce({ kind: "conversation_not_found" });
        const service = new ConversationHandoffV2Service({ repository: store });
        const input = { conversationId: "9007199254740995", commandKey: "handoff-1", expectedVersion: "0" };

        await expect(service.requestHumanOwn(customerContext, input)).resolves.toEqual({ kind: "handoff_command_conflict" });
        await expect(service.requestHumanOwn(customerContext, input)).resolves.toEqual({ kind: "handoff_version_conflict" });
        await expect(service.requestHumanOwn(customerContext, input)).resolves.toEqual({ kind: "conversation_not_found" });
        vi.mocked(store.requestCustomerHandoff).mockRejectedValueOnce(new Error("database detail"));
        await expect(service.requestHumanOwn(customerContext, input)).resolves.toEqual({ kind: "handoff_unavailable" });
    });
});
