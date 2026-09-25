import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ConversationViewV2 = {
    id: EntityId;
    customerId: EntityId;
    status: "open" | "waiting_staff";
    replyMode: "bot" | "human" | "paused";
    createdAt: string;
    lastMessageAt: string | null;
};

export type ConversationOpenV2Outcome =
    | { kind: "conversation"; conversation: ConversationViewV2; created: boolean }
    | { kind: "customer_unavailable" }
    | { kind: "active_conversation_integrity_error" };

export interface ConversationOpenV2Repository {
    openOrGetActive: (input: {
        accountId: EntityId;
        customerId: EntityId;
    }) => Promise<ConversationOpenV2Outcome>;
}

export type ConversationOpenV2Result =
    | Extract<ConversationOpenV2Outcome, { kind: "conversation" }>
    | { kind: "customer_profile_required" | "conversation_unavailable" };

/**
 * Own-conversation boundary. It owns no transport and deliberately does not
 * schedule AI work; a later use case is the only place that may create runs.
 */
export class ConversationV2Service {
    constructor(private readonly dependencies: { repository: ConversationOpenV2Repository }) {}

    async openOwn(context: V2AccessContext): Promise<ConversationOpenV2Result> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        try {
            const result = await this.dependencies.repository.openOrGetActive({
                accountId: serializeEntityId(context.accountId),
                customerId: serializeEntityId(context.customerId),
            });
            if (result.kind === "conversation") return result;
            return { kind: "conversation_unavailable" };
        } catch {
            return { kind: "conversation_unavailable" };
        }
    }
}
