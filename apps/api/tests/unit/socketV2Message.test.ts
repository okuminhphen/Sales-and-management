import { describe, expect, it } from "vitest";
import { displaySocketMessage } from "../../src/socket-v2.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("V2 Socket message view", () => {
    it("matches the REST chat message shape and never exposes the internal content field", () => {
        expect(displaySocketMessage({
            id: serializeEntityId("1"),
            conversationId: serializeEntityId("2"),
            seq: "3",
            senderType: "customer",
            content: "Xin chào",
            createdAt: "2026-09-29T15:00:00.000Z",
        })).toEqual({
            id: "1",
            conversationId: "2",
            seq: "3",
            senderType: "customer",
            message: "Xin chào",
            createdAt: "2026-09-29T15:00:00.000Z",
        });
    });
});
