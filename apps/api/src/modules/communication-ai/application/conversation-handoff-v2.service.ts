import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

export type ConversationHandoffViewV2 = {
    id: EntityId;
    status: "open" | "waiting_staff" | "closed";
    replyMode: "bot" | "human" | "paused";
    version: string;
    handoffRequestedAt: string | null;
};

type CustomerConversationIdentity = {
    accountId: EntityId;
    customerId: EntityId;
    conversationId: EntityId;
};

export type CustomerHandoffOutcome =
    | { kind: "handoff_requested"; handoff: ConversationHandoffViewV2; replayed: boolean }
    | { kind: "conversation_not_found" | "conversation_not_requestable" | "version_conflict" | "command_conflict" };

export interface ConversationHandoffV2Repository {
    requestCustomerHandoff: (input: CustomerConversationIdentity & {
        commandKey: string;
        expectedVersion: string;
    }) => Promise<CustomerHandoffOutcome>;
}

export type CustomerHandoffResult = Exclude<CustomerHandoffOutcome, { kind: "command_conflict" | "version_conflict" }>
    | { kind: "handoff_command_conflict" | "handoff_version_conflict" }
    | { kind: "customer_profile_required" | "invalid_handoff_request" | "handoff_unavailable" };

const normalizeCommandKey = (value: unknown): string | null =>
    typeof value === "string" && /^[A-Za-z0-9._:-]{1,191}$/.test(value) ? value : null;

/** Version is a non-negative signed MySQL BIGINT but is not an entity ID: zero is valid. */
const normalizeVersion = (value: unknown): string | null => {
    if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) return null;
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > MAX_SIGNED_BIGINT) return null;
    return parsed.toString(10);
};

/**
 * Customer-only control boundary. It does not choose an assignee, notify staff,
 * create AI work, or publish Socket events; those need independent scope/policy.
 */
export class ConversationHandoffV2Service {
    constructor(private readonly dependencies: { repository: ConversationHandoffV2Repository }) {}

    async requestHumanOwn(
        context: V2AccessContext,
        input: { conversationId: unknown; commandKey: unknown; expectedVersion: unknown },
    ): Promise<CustomerHandoffResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        const commandKey = normalizeCommandKey(input.commandKey);
        const expectedVersion = normalizeVersion(input.expectedVersion);
        let identity: CustomerConversationIdentity;
        try {
            identity = {
                accountId: serializeEntityId(context.accountId),
                customerId: serializeEntityId(context.customerId),
                conversationId: serializeEntityId(input.conversationId),
            };
        } catch {
            return { kind: "invalid_handoff_request" };
        }
        if (!commandKey || expectedVersion === null) return { kind: "invalid_handoff_request" };

        try {
            const outcome = await this.dependencies.repository.requestCustomerHandoff({
                ...identity, commandKey, expectedVersion,
            });
            if (outcome.kind === "command_conflict") return { kind: "handoff_command_conflict" };
            if (outcome.kind === "version_conflict") return { kind: "handoff_version_conflict" };
            return outcome;
        } catch {
            return { kind: "handoff_unavailable" };
        }
    }
}
