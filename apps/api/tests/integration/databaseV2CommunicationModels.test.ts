import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createV2ModelRegistry } from "../../src/database/v2/persistence.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import {
    createCommunicationAiPersistenceModule,
    createOutboxPersistenceModule,
    createPersonalizationPersistenceModule,
} from "../../src/modules/communication-ai/persistence/communication.models.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

const expectedColumns = {
    Conversation: ["id", "customer_id", "branch_id", "assigned_account_id", "subject", "status", "reply_mode", "version", "last_message_seq", "mode_changed_by_account_id", "mode_changed_at", "handoff_requested_at", "last_message_at", "closed_at", "created_at", "updated_at"],
    Message: ["id", "conversation_id", "seq", "sender_account_id", "sender_type", "message_type", "dedup_key", "request_hash", "reply_to_message_id", "content", "metadata", "created_at"],
    ConversationEvent: ["id", "conversation_id", "event_type", "actor_account_id", "from_mode", "to_mode", "from_assignee_id", "to_assignee_id", "from_branch_id", "to_branch_id", "from_status", "to_status", "version_after", "command_key", "request_hash", "reason_code", "created_at"],
    ConversationReadState: ["conversation_id", "account_id", "last_read_seq", "read_at"],
    AssistantRun: ["id", "conversation_id", "trigger_message_id", "expected_version", "context_last_seq", "status", "attempt_count", "next_attempt_at", "lease_token", "lease_expires_at", "response_message_id", "model_name", "error_code", "created_at", "started_at", "completed_at"],
    Notification: ["id", "recipient_account_id", "type", "title", "content", "data", "read_at", "created_at"],
    BehaviorEvent: ["id", "customer_id", "anonymous_session_id", "product_id", "event_type", "event_data", "occurred_at", "created_at"],
    CustomerProductStat: ["id", "customer_id", "product_id", "view_count", "is_liked", "last_viewed_at", "updated_at"],
    OutboxEvent: ["id", "event_id", "event_type", "aggregate_type", "aggregate_id", "payload", "occurred_at", "published_at", "attempts", "locked_at", "last_error", "created_at", "updated_at"],
} as const;

describe.skipIf(!runDatabaseV2Tests)("Database V2 communication typed models on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => sequelize?.close());

    it("maps each communication, personalization and outbox model to its V2 table", async () => {
        const modules = [
            createCommunicationAiPersistenceModule(sequelize),
            createPersonalizationPersistenceModule(sequelize),
            createOutboxPersistenceModule(sequelize),
        ];
        expect(() => createV2ModelRegistry(modules)).not.toThrow();
        const definitions = modules.flatMap(({ models }) => models);
        expect(definitions.map(({ name }) => name).sort()).toEqual(Object.keys(expectedColumns).sort());

        for (const { name, model } of definitions) {
            const tableName = model.getTableName() as string;
            const fields = Object.entries(model.getAttributes())
                .map(([attributeName, attribute]) => attribute.field ?? attributeName)
                .sort();
            const table = await sequelize.getQueryInterface().describeTable(tableName);
            expect(fields).toEqual([...expectedColumns[name as keyof typeof expectedColumns]].sort());
            expect(Object.keys(table).sort()).toEqual(fields);
        }
    });
});
