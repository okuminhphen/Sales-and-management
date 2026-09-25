import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { SequelizeConversationHandoffV2Repository } from "../../src/modules/communication-ai/persistence/conversation-handoff-v2.repository.js";
import { SequelizeConversationOpenV2Repository } from "../../src/modules/communication-ai/persistence/conversation-v2.repository.js";
import { serializeDatabaseEntityId, serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Conversation V2 customer handoff persistence on MySQL", () => {
    let db: Sequelize;
    const suffix = randomUUID().slice(0, 8);
    let accountA = "";
    let customerA = "";
    let accountB = "";
    let customerB = "";
    let conversationA = "";

    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Expected database row was not found.");
        return rows[0];
    };

    const createCustomer = async (label: string): Promise<{ accountId: string; customerId: string }> => {
        const email = `conversation-handoff-${label}-${suffix}@example.invalid`;
        await db.query(
            `INSERT INTO accounts (email, status, created_at, updated_at)
             VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [email] },
        );
        const accountId = serializeDatabaseEntityId(
            (await one<{ id: unknown }>("SELECT id FROM accounts WHERE email = ?", [email])).id,
        );
        await db.query(
            `INSERT INTO customers (account_id, status, loyalty_points, created_at, updated_at)
             VALUES (?, 'active', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [accountId] },
        );
        const customerId = serializeDatabaseEntityId(
            (await one<{ id: unknown }>("SELECT id FROM customers WHERE account_id = ?", [accountId])).id,
        );
        return { accountId, customerId };
    };

    const open = async (accountId: string, customerId: string): Promise<string> => {
        const outcome = await new SequelizeConversationOpenV2Repository(createSalesV2Persistence(db)).openOrGetActive({
            accountId: serializeEntityId(accountId), customerId: serializeEntityId(customerId),
        });
        if (outcome.kind !== "conversation") throw new Error("Conversation fixture was not created.");
        return outcome.conversation.id;
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
        ({ accountId: accountA, customerId: customerA } = await createCustomer("a"));
        ({ accountId: accountB, customerId: customerB } = await createCustomer("b"));
        conversationA = await open(accountA, customerA);
    });

    afterAll(async () => db?.close());

    it("writes one atomic waiting-staff transition and replays only the original command payload", async () => {
        const repository = new SequelizeConversationHandoffV2Repository(createSalesV2Persistence(db));
        const owner = {
            accountId: serializeEntityId(accountA), customerId: serializeEntityId(customerA),
            conversationId: serializeEntityId(conversationA), commandKey: "handoff-primary", expectedVersion: "0",
        };

        await expect(repository.requestCustomerHandoff(owner)).resolves.toMatchObject({
            kind: "handoff_requested", replayed: false,
            handoff: { id: conversationA, status: "waiting_staff", replyMode: "paused", version: "1" },
        });
        const retries = await Promise.all(Array.from({ length: 5 }, () => repository.requestCustomerHandoff(owner)));
        expect(retries).toHaveLength(5);
        expect(retries.every((outcome) => outcome.kind === "handoff_requested" && outcome.replayed)).toBe(true);
        await expect(repository.requestCustomerHandoff({ ...owner, expectedVersion: "1" }))
            .resolves.toEqual({ kind: "command_conflict" });

        const row = await one<{
            status: string; replyMode: string; version: string | number; assignedAccountId: unknown; handoffRequestedAt: unknown;
        }>(
            `SELECT status, reply_mode AS replyMode, version, assigned_account_id AS assignedAccountId,
                    handoff_requested_at AS handoffRequestedAt
             FROM conversations WHERE id = ?`,
            [conversationA],
        );
        expect({ ...row, version: String(row.version) }).toMatchObject({
            status: "waiting_staff", replyMode: "paused", version: "1", assignedAccountId: null,
        });
        expect(row.handoffRequestedAt).not.toBeNull();
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM conversation_events WHERE conversation_id = ? AND event_type = 'handoff_requested'",
            [conversationA],
        )).count)).toBe(1);
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM assistant_runs WHERE conversation_id = ?", [conversationA],
        )).count)).toBe(0);
    });

    it("lets only one concurrent customer command advance a conversation version", async () => {
        const conversationId = await open(accountB, customerB);
        const repository = new SequelizeConversationHandoffV2Repository(createSalesV2Persistence(db));
        const owner = {
            accountId: serializeEntityId(accountB), customerId: serializeEntityId(customerB),
            conversationId: serializeEntityId(conversationId), expectedVersion: "0",
        };

        const outcomes = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.requestCustomerHandoff({
            ...owner, commandKey: `handoff-race-${index}`,
        })));
        expect(outcomes.filter((outcome) => outcome.kind === "handoff_requested")).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome.kind === "version_conflict")).toHaveLength(4);
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM conversation_events WHERE conversation_id = ? AND event_type = 'handoff_requested'",
            [conversationId],
        )).count)).toBe(1);
    });

    it("audits the prior assignee when a customer releases an assigned paused conversation", async () => {
        const { accountId, customerId } = await createCustomer("paused-assignee");
        const conversationId = await open(accountId, customerId);
        const staffEmail = `conversation-handoff-staff-${suffix}@example.invalid`;
        await db.query(
            `INSERT INTO accounts (email, status, created_at, updated_at)
             VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [staffEmail] },
        );
        const staffAccountId = serializeDatabaseEntityId(
            (await one<{ id: unknown }>("SELECT id FROM accounts WHERE email = ?", [staffEmail])).id,
        );
        await db.query(
            `UPDATE conversations
             SET assigned_account_id = ?, reply_mode = 'paused', mode_changed_by_account_id = ?,
                 mode_changed_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
             WHERE id = ?`,
            { replacements: [staffAccountId, staffAccountId, conversationId] },
        );
        const repository = new SequelizeConversationHandoffV2Repository(createSalesV2Persistence(db));

        await expect(repository.requestCustomerHandoff({
            accountId: serializeEntityId(accountId), customerId: serializeEntityId(customerId),
            conversationId: serializeEntityId(conversationId), commandKey: "handoff-release-assignee", expectedVersion: "0",
        })).resolves.toMatchObject({ kind: "handoff_requested", replayed: false });
        const event = await one<{ fromAssigneeId: unknown; toAssigneeId: unknown }>(
            `SELECT from_assignee_id AS fromAssigneeId, to_assignee_id AS toAssigneeId
             FROM conversation_events
             WHERE conversation_id = ? AND event_type = 'handoff_requested'`,
            [conversationId],
        );
        expect({ ...event, fromAssigneeId: String(event.fromAssigneeId) }).toEqual({
            fromAssigneeId: staffAccountId,
            toAssigneeId: null,
        });
    });

    it("does not reveal or transition another customer's conversation", async () => {
        const repository = new SequelizeConversationHandoffV2Repository(createSalesV2Persistence(db));

        await expect(repository.requestCustomerHandoff({
            accountId: serializeEntityId(accountB), customerId: serializeEntityId(customerB),
            conversationId: serializeEntityId(conversationA), commandKey: "customer-b-forged", expectedVersion: "1",
        })).resolves.toEqual({ kind: "conversation_not_found" });
    });
});
