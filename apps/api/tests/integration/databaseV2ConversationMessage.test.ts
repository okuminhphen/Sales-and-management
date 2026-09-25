import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { QueryTypes, Sequelize } from "sequelize";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { SequelizeConversationMessageV2Repository } from "../../src/modules/communication-ai/persistence/conversation-message-v2.repository.js";
import { SequelizeConversationOpenV2Repository } from "../../src/modules/communication-ai/persistence/conversation-v2.repository.js";
import { ConversationMessageV2Service } from "../../src/modules/communication-ai/application/conversation-message-v2.service.js";
import { ConversationV2Service } from "../../src/modules/communication-ai/application/conversation-v2.service.js";
import { createConversationV2Router } from "../../src/modules/communication-ai/interfaces/http/conversation-v2.routes.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { serializeDatabaseEntityId, serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Conversation V2 message persistence on MySQL", () => {
    let db: Sequelize;
    const suffix = randomUUID().slice(0, 8);
    let accountA = "";
    let customerA = "";
    let accountB = "";
    let customerB = "";
    let conversationId = "";

    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Expected database row was not found.");
        return rows[0];
    };

    const createCustomer = async (label: string): Promise<{ accountId: string; customerId: string }> => {
        const email = `conversation-message-${label}-${suffix}@example.invalid`;
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
        const persistence = createSalesV2Persistence(db);
        const opened = await new SequelizeConversationOpenV2Repository(persistence).openOrGetActive({
            accountId: serializeEntityId(accountA), customerId: serializeEntityId(customerA),
        });
        if (opened.kind !== "conversation") throw new Error("Conversation fixture was not created.");
        conversationId = opened.conversation.id;
    });

    afterAll(async () => db?.close());

    it("serializes concurrent customer writes and replays only an identical dedup key", async () => {
        const repository = new SequelizeConversationMessageV2Repository(createSalesV2Persistence(db));
        const owner = {
            accountId: serializeEntityId(accountA), customerId: serializeEntityId(customerA),
            conversationId: serializeEntityId(conversationId),
        };
        const uniqueWrites = await Promise.all(Array.from({ length: 8 }, (_, index) => repository.sendCustomerMessage({
            ...owner, dedupKey: `concurrent-${index}`, content: `Nội dung ${index}`,
        })));
        expect(uniqueWrites.every((outcome) => outcome.kind === "message" && !outcome.replayed)).toBe(true);
        const uniqueMessages = uniqueWrites.filter((outcome): outcome is Extract<(typeof uniqueWrites)[number], { kind: "message" }> =>
            outcome.kind === "message",
        );
        expect(new Set(uniqueMessages.map(({ message }) => message.id))).toHaveLength(8);
        expect(uniqueMessages.map(({ message }) => Number(message.seq)).sort((left, right) => left - right))
            .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

        const retries = await Promise.all(Array.from({ length: 5 }, () => repository.sendCustomerMessage({
            ...owner, dedupKey: "retry-key", content: "Gửi lại an toàn",
        })));
        expect(retries.every((outcome) => outcome.kind === "message")).toBe(true);
        const replayed = retries.filter((outcome): outcome is Extract<(typeof retries)[number], { kind: "message" }> =>
            outcome.kind === "message",
        );
        expect(new Set(replayed.map(({ message }) => message.id))).toHaveLength(1);
        expect(replayed.filter(({ replayed: wasReplayed }) => !wasReplayed)).toHaveLength(1);
        expect(replayed.filter(({ replayed: wasReplayed }) => wasReplayed)).toHaveLength(4);
        await expect(repository.sendCustomerMessage({
            ...owner, dedupKey: "retry-key", content: "Nội dung đã bị thay đổi",
        })).resolves.toEqual({ kind: "deduplication_conflict" });

        expect(Number((await one<{ lastMessageSeq: string | number }>(
            "SELECT last_message_seq AS lastMessageSeq FROM conversations WHERE id = ?", [conversationId],
        )).lastMessageSeq)).toBe(9);
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?", [conversationId],
        )).count)).toBe(9);
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM assistant_runs WHERE conversation_id = ?", [conversationId],
        )).count)).toBe(0);
    });

    it("reads a bounded chronological history and hides a customer conversation from another customer", async () => {
        const repository = new SequelizeConversationMessageV2Repository(createSalesV2Persistence(db));
        const owner = {
            accountId: serializeEntityId(accountA), customerId: serializeEntityId(customerA),
            conversationId: serializeEntityId(conversationId),
        };
        const latest = await repository.listCustomerMessages({ ...owner, beforeSeq: null, limit: 3 });
        expect(latest).toMatchObject({ kind: "messages", page: { nextBeforeSeq: "7" } });
        if (latest.kind !== "messages") throw new Error("Expected owned message page.");
        expect(latest.page.messages.map(({ seq }) => seq)).toEqual(["7", "8", "9"]);
        const previous = await repository.listCustomerMessages({ ...owner, beforeSeq: serializeEntityId("7"), limit: 3 });
        expect(previous).toMatchObject({ kind: "messages", page: { nextBeforeSeq: "4" } });
        if (previous.kind !== "messages") throw new Error("Expected previous message page.");
        expect(previous.page.messages.map(({ seq }) => seq)).toEqual(["4", "5", "6"]);

        const other = {
            accountId: serializeEntityId(accountB), customerId: serializeEntityId(customerB),
            conversationId: serializeEntityId(conversationId), beforeSeq: null, limit: 3,
        };
        await expect(repository.listCustomerMessages(other)).resolves.toEqual({ kind: "conversation_not_found" });
        await expect(repository.sendCustomerMessage({
            ...other, dedupKey: "customer-b-attempt", content: "Không được phép",
        })).resolves.toEqual({ kind: "conversation_not_found" });
    });

    it("executes the V2 HTTP adapter against the real message transaction without legacy mounting", async () => {
        const persistence = createSalesV2Persistence(db);
        const auth: RequestHandler = (req, _res, next) => {
            (req as V2AuthenticatedRequest).v2AccessContext = {
                accountId: accountA, customerId: customerA, employeeId: null, grants: [],
            };
            next();
        };
        const app = express();
        app.use(express.json());
        app.use("/api/v1", createConversationV2Router({ auth,
            conversation: new ConversationV2Service({ repository: new SequelizeConversationOpenV2Repository(persistence) }),
            messages: new ConversationMessageV2Service({ repository: new SequelizeConversationMessageV2Repository(persistence) }),
        }));

        await request(app).post(`/api/v1/message/send/${conversationId}`).send({
            clientMessageId: "http-real-message", message: "Gửi qua HTTP V2",
        }).expect(200).expect((response) => {
            expect(response.body).toMatchObject({ EM: "Send message successfully", EC: 0,
                DT: { conversationId, seq: "10", message: "Gửi qua HTTP V2", replayed: false } });
        });
        expect(Number((await one<{ count: string | number }>(
            "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?", [conversationId],
        )).count)).toBe(10);
    });
});
