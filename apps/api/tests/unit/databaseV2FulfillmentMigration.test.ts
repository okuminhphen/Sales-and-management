import type { QueryInterface } from "sequelize";
import { describe, expect, it } from "vitest";
import migration from "../../src/database/v2/migrations/0004-fulfillment.js";

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

describe("Database V2 fulfillment baseline migration", () => {
    it("creates five delivery and return tables with snapshot, deduplication, and refund constraints", async () => {
        const { queryInterface, statements } = createQueryInterface();
        await migration.up(queryInterface);

        const ddl = statements.join("\n").replace(/\s+/g, " ");
        const tableNames = [...ddl.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
        expect(tableNames).toEqual([
            "shipments", "shipment_events", "returns", "return_items", "refunds",
        ]);
        expect(ddl).toContain("UNIQUE KEY `uq_shipments_order` (`order_id`)");
        expect(ddl).toContain("CONSTRAINT `chk_shipment_recipient` CHECK (");
        expect(ddl).toContain("CONSTRAINT `uq_shipment_event_key` UNIQUE (`shipment_id`, `event_key`)");
        expect(ddl).toContain("CONSTRAINT `chk_return_quantities` CHECK (");
        expect(ddl).toContain("CONSTRAINT `chk_return_disposition` CHECK (");
        expect(ddl).toContain("UNIQUE KEY `uq_refunds_idempotency_key` (`idempotency_key`)");
        expect(ddl).toContain("CONSTRAINT `chk_refund_completion_time` CHECK (");
        expect(ddl).not.toMatch(/IF NOT EXISTS|DROP TABLE|sequelize\.sync/i);
    });

    it("refuses a partially existing baseline before issuing DDL", async () => {
        const { queryInterface, statements } = createQueryInterface(["returns"]);
        await expect(migration.up(queryInterface)).rejects.toThrow(
            "refuses to run when any owned table already exists",
        );
        expect(statements).toEqual([]);
    });
});
