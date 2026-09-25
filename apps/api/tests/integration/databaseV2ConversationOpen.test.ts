import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { SequelizeConversationOpenV2Repository } from "../../src/modules/communication-ai/persistence/conversation-v2.repository.js";
import { serializeDatabaseEntityId, serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Conversation V2 open persistence on MySQL", () => {
    let db: Sequelize;
    const suffix = randomUUID().slice(0, 8);
    let accountId = "";
    let customerId = "";

    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Expected database row was not found.");
        return rows[0];
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        db = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
        });
        await db.authenticate();
        const email = `conversation-open-${suffix}@example.invalid`;
        await db.query(
            `INSERT INTO accounts (email, status, created_at, updated_at)
             VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [email] },
        );
        accountId = serializeDatabaseEntityId(
            (await one<{ id: unknown }>("SELECT id FROM accounts WHERE email = ?", [email])).id,
        );
        await db.query(
            `INSERT INTO customers (account_id, status, loyalty_points, created_at, updated_at)
             VALUES (?, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [accountId] },
        );
        customerId = serializeDatabaseEntityId(
            (await one<{ id: unknown }>("SELECT id FROM customers WHERE account_id = ?", [accountId])).id,
        );
    });

    afterAll(async () => db?.close());

    it("serializes concurrent opens into one active bot conversation and one created event", async () => {
        const repository = new SequelizeConversationOpenV2Repository(createSalesV2Persistence(db));
        const input = { accountId: serializeEntityId(accountId), customerId: serializeEntityId(customerId) };

        const outcomes = await Promise.all(Array.from({ length: 5 }, () => repository.openOrGetActive(input)));
        expect(outcomes.every((outcome) => outcome.kind === "conversation")).toBe(true);
        const conversations = outcomes.filter((outcome): outcome is Extract<(typeof outcomes)[number], { kind: "conversation" }> =>
            outcome.kind === "conversation",
        );
        expect(new Set(conversations.map(({ conversation }) => conversation.id))).toHaveLength(1);
        expect(conversations.filter(({ created }) => created)).toHaveLength(1);
        expect(conversations[0]?.conversation).toMatchObject({ customerId, status: "open", replyMode: "bot", lastMessageAt: null });

        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM conversations WHERE customer_id = ? AND status IN ('open', 'waiting_staff')",
            [customerId],
        )).count)).toBe(1);
        const conversationId = conversations[0]!.conversation.id;
        const createdEvent = await one<{
            eventType: string; actorAccountId: string | number; toMode: string; toStatus: string; versionAfter: string | number;
        }>(
            `SELECT event_type AS eventType, actor_account_id AS actorAccountId, to_mode AS toMode,
                    to_status AS toStatus, version_after AS versionAfter
             FROM conversation_events WHERE conversation_id = ?`,
            [conversationId],
        );
        expect({ ...createdEvent, actorAccountId: String(createdEvent.actorAccountId), versionAfter: String(createdEvent.versionAfter) })
            .toEqual({ eventType: "created", actorAccountId: accountId, toMode: "bot", toStatus: "open", versionAfter: "0" });
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM assistant_runs WHERE conversation_id = ?", [conversationId],
        )).count)).toBe(0);
    });

    it("fails closed when an account or customer is no longer active", async () => {
        const repository = new SequelizeConversationOpenV2Repository(createSalesV2Persistence(db));
        await db.query("UPDATE accounts SET status = 'inactive' WHERE id = ?", { replacements: [accountId] });

        await expect(repository.openOrGetActive({
            accountId: serializeEntityId(accountId), customerId: serializeEntityId(customerId),
        })).resolves.toEqual({ kind: "customer_unavailable" });
        await db.query("UPDATE accounts SET status = 'active' WHERE id = ?", { replacements: [accountId] });
    });
});
