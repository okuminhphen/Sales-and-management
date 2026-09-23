import type { QueryInterface } from "sequelize";
import { describe, expect, it } from "vitest";
import migration from "../../src/database/v2/migrations/0006-communication.js";

const createQueryInterface = (existingTables: string[] = []) => {
    const statements: string[] = [];
    const queryInterface = {
        showAllTables: async () => existingTables,
        sequelize: {
            query: async (statement: string) => {
                statements.push(statement);
                return [];
            },
        },
    } as unknown as QueryInterface;
    return { queryInterface, statements };
};

describe("Database V2 communication baseline migration", () => {
    it("creates nine chat, personalization and outbox tables", async () => {
        const { queryInterface, statements } = createQueryInterface();
        await migration.up(queryInterface);
        const ddl = statements.join("\n").replace(/\s+/g, " ");
        expect([...ddl.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1])).toEqual([
            "conversations", "messages", "conversation_events", "conversation_read_states",
            "assistant_runs", "notifications", "behavior_events", "customer_product_stats",
            "outbox_events",
        ]);
        expect(ddl).toContain("CONSTRAINT `chk_conversation_human_owner` CHECK (");
        expect(ddl).toContain("CONSTRAINT `uq_messages_conversation_dedup` UNIQUE");
        expect(ddl).toContain("CONSTRAINT `uq_conversation_events_version` UNIQUE");
        expect(ddl).toContain("CONSTRAINT `chk_assistant_run_lease` CHECK (");
        expect(ddl).toContain("CONSTRAINT `uq_customer_product_stats_customer_product` UNIQUE");
        expect(ddl).toContain("UNIQUE KEY `uq_outbox_events_event_id` (`event_id`)");
        expect(ddl).not.toMatch(/IF NOT EXISTS|DROP TABLE|sequelize\.sync/i);
    });

    it("rejects an existing owned table before issuing DDL", async () => {
        const { queryInterface, statements } = createQueryInterface(["messages"]);
        await expect(migration.up(queryInterface)).rejects.toThrow(
            "refuses to run when any owned table already exists",
        );
        expect(statements).toEqual([]);
    });
});
