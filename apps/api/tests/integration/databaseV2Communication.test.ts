import { randomUUID } from "node:crypto";
import { QueryTypes, Sequelize, type Transaction } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Database V2 communication on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(
            env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD,
            { host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false },
        );
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    const insert = async (sql: string, values: Array<string | number | null>, transaction: Transaction) => {
        const [id] = await sequelize.query(sql, {
            replacements: values, transaction, type: QueryTypes.INSERT,
        });
        return String(id);
    };

    const seedReferences = async (transaction: Transaction) => {
        const token = randomUUID().slice(0, 8);
        const accountId = await insert(
            "INSERT INTO `accounts` (`email`, `status`, `created_at`, `updated_at`) VALUES (?, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`chat-${token}@example.invalid`], transaction,
        );
        const customerId = await insert(
            "INSERT INTO `customers` (`account_id`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [accountId], transaction,
        );
        const categoryId = await insert(
            "INSERT INTO `categories` (`code`, `name`, `slug`, `created_at`, `updated_at`) VALUES (?, 'Chat', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [`CAT-${token}`, `chat-${token}`], transaction,
        );
        const productId = await insert(
            "INSERT INTO `products` (`category_id`, `name`, `slug`, `base_price`, `created_at`, `updated_at`) VALUES (?, 'Chat', ?, '100.0000', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [categoryId, `product-${token}`], transaction,
        );
        const conversationId = await insert(
            "INSERT INTO `conversations` (`customer_id`, `mode_changed_at`, `created_at`, `updated_at`) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
            [customerId], transaction,
        );
        return { token, accountId, customerId, productId, conversationId };
    };

    const addMessage = (
        transaction: Transaction,
        conversationId: string,
        accountId: string | null,
        seq: number,
        dedup: string,
        senderType = "customer",
        content = "Test message",
    ) => insert(
        "INSERT INTO `messages` (`conversation_id`, `seq`, `sender_account_id`, `sender_type`, `dedup_key`, `request_hash`, `content`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
        [conversationId, seq, accountId, senderType, dedup, "a".repeat(64), content], transaction,
    );

    it("creates nine tables and all 23 typed foreign keys", async () => {
        const tables = await sequelize.query<{ tableName: string }>(
            "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('conversations', 'messages', 'conversation_events', 'conversation_read_states', 'assistant_runs', 'notifications', 'behavior_events', 'customer_product_stats', 'outbox_events')",
            { type: QueryTypes.SELECT },
        );
        expect(tables).toHaveLength(9);
        const foreignKeys = await sequelize.query<{ constraintName: string }>(
            "SELECT constraint_name AS constraintName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name IN ('conversations', 'messages', 'conversation_events', 'conversation_read_states', 'assistant_runs', 'notifications', 'behavior_events', 'customer_product_stats', 'outbox_events') AND referenced_table_name IS NOT NULL",
            { type: QueryTypes.SELECT },
        );
        expect(foreignKeys).toHaveLength(23);
    });

    it("enforces chat ownership, message sender identity and deduplication", async () => {
        const transaction = await sequelize.transaction();
        try {
            const ref = await seedReferences(transaction);
            const update = (sql: string) => sequelize.query(sql, {
                replacements: [ref.conversationId], transaction,
            });
            await expect(update("UPDATE `conversations` SET `reply_mode` = 'human' WHERE `id` = ?")).rejects.toThrow();
            await expect(update("UPDATE `conversations` SET `status` = 'waiting_staff' WHERE `id` = ?")).rejects.toThrow();
            await expect(update("UPDATE `conversations` SET `status` = 'closed' WHERE `id` = ?")).rejects.toThrow();
            await addMessage(transaction, ref.conversationId, ref.accountId, 1, "customer-1");
            await expect(addMessage(transaction, ref.conversationId, ref.accountId, 1, "customer-2")).rejects.toThrow();
            await expect(addMessage(transaction, ref.conversationId, ref.accountId, 2, "customer-1")).rejects.toThrow();
            await expect(addMessage(transaction, ref.conversationId, null, 2, "missing-actor")).rejects.toThrow();
            await expect(addMessage(transaction, ref.conversationId, ref.accountId, 2, "empty-content", "customer", "   ")).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("enforces control command deduplication and assistant run lease/schedule", async () => {
        const transaction = await sequelize.transaction();
        try {
            const ref = await seedReferences(transaction);
            const messageId = await addMessage(transaction, ref.conversationId, ref.accountId, 1, "trigger-1");
            const addEvent = (command: string, version: number) => insert(
                "INSERT INTO `conversation_events` (`conversation_id`, `event_type`, `to_mode`, `to_status`, `version_after`, `command_key`, `request_hash`, `created_at`) VALUES (?, 'created', 'paused', 'open', ?, ?, ?, UTC_TIMESTAMP())",
                [ref.conversationId, version, command, "b".repeat(64)], transaction,
            );
            await addEvent("create", 0);
            await expect(addEvent("create", 0)).rejects.toThrow();
            await expect(addEvent("new-command", 0)).rejects.toThrow();
            const addRun = (nextAttemptAt: string | null, status = "queued") => insert(
                "INSERT INTO `assistant_runs` (`conversation_id`, `trigger_message_id`, `expected_version`, `context_last_seq`, `status`, `next_attempt_at`, `created_at`) VALUES (?, ?, 0, 1, ?, ?, UTC_TIMESTAMP())",
                [ref.conversationId, messageId, status, nextAttemptAt], transaction,
            );
            await expect(addRun(null)).rejects.toThrow();
            await expect(addRun(null, "generating")).rejects.toThrow();
            await addRun("2026-09-24 00:00:00");
            await expect(addRun("2026-09-24 00:00:00")).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });

    it("deduplicates customer product stats and outbox event IDs", async () => {
        const transaction = await sequelize.transaction();
        try {
            const ref = await seedReferences(transaction);
            const addStat = () => insert(
                "INSERT INTO `customer_product_stats` (`customer_id`, `product_id`, `updated_at`) VALUES (?, ?, UTC_TIMESTAMP())",
                [ref.customerId, ref.productId], transaction,
            );
            await addStat();
            await expect(addStat()).rejects.toThrow();
            const eventId = randomUUID();
            const addOutbox = () => insert(
                "INSERT INTO `outbox_events` (`event_id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload`, `occurred_at`, `created_at`, `updated_at`) VALUES (?, 'product.updated', 'product', ?, '{}', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                [eventId, ref.productId], transaction,
            );
            await addOutbox();
            await expect(addOutbox()).rejects.toThrow();
        } finally {
            await transaction.rollback();
        }
    });
});
