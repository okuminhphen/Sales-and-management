import { describe, expect, it, vi } from "vitest";
import {
    ConversationV2Service,
    type ConversationOpenV2Repository,
    type ConversationViewV2,
} from "../../src/modules/communication-ai/application/conversation-v2.service.js";
import type { V2AccessContext } from "../../src/modules/identity-access/application/access-context.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const customerContext: V2AccessContext = {
    accountId: "9007199254740993",
    customerId: "9007199254740994",
    employeeId: null,
    grants: [{ roleCode: "CUSTOMER", scope: { type: "global" }, permissions: [] }],
};

const conversation: ConversationViewV2 = {
    id: serializeEntityId("9007199254740995"),
    customerId: serializeEntityId("9007199254740994"),
    status: "open",
    replyMode: "bot",
    createdAt: "2026-09-25T00:00:00.000Z",
    lastMessageAt: null,
};

const repository = (): ConversationOpenV2Repository => ({
    openOrGetActive: vi.fn(async () => ({ kind: "conversation" as const, conversation, created: true })),
});

describe("ConversationV2Service", () => {
    it("opens or reuses only the conversation owned by the DB-derived customer", async () => {
        const store = repository();
        const service = new ConversationV2Service({ repository: store });

        await expect(service.openOwn(customerContext)).resolves.toEqual({
            kind: "conversation", conversation, created: true,
        });
        expect(store.openOrGetActive).toHaveBeenCalledWith({
            accountId: serializeEntityId(customerContext.accountId),
            customerId: serializeEntityId(customerContext.customerId!),
        });
    });

    it("fails closed when the authenticated account has no active customer profile", async () => {
        const store = repository();
        const service = new ConversationV2Service({ repository: store });

        await expect(service.openOwn({ ...customerContext, customerId: null })).resolves.toEqual({
            kind: "customer_profile_required",
        });
        expect(store.openOrGetActive).not.toHaveBeenCalled();
    });

    it("does not leak storage or integrity detail", async () => {
        const store = repository();
        vi.mocked(store.openOrGetActive).mockResolvedValueOnce({ kind: "customer_unavailable" });
        vi.mocked(store.openOrGetActive).mockResolvedValueOnce({ kind: "active_conversation_integrity_error" });
        const service = new ConversationV2Service({ repository: store });

        await expect(service.openOwn(customerContext)).resolves.toEqual({ kind: "conversation_unavailable" });
        await expect(service.openOwn(customerContext)).resolves.toEqual({ kind: "conversation_unavailable" });
        vi.mocked(store.openOrGetActive).mockRejectedValueOnce(new Error("database detail"));
        await expect(service.openOwn(customerContext)).resolves.toEqual({ kind: "conversation_unavailable" });
    });
});
