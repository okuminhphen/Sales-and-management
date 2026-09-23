import type { QueryInterface } from "sequelize";
import { describe, expect, it } from "vitest";
import migration from "../../src/database/v2/migrations/0005-inventory.js";

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

describe("Database V2 inventory baseline migration", () => {
    it("creates nine inventory and transfer tables in FK-safe order", async () => {
        const { queryInterface, statements } = createQueryInterface();
        await migration.up(queryInterface);
        const ddl = statements.join("\n").replace(/\s+/g, " ");
        expect([...ddl.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1])).toEqual([
            "inventories", "stock_requests", "stock_request_items", "stock_request_history",
            "transfer_receipts", "transfer_receipt_items", "transfer_history",
            "inventory_reservations", "inventory_movements",
        ]);
        expect(ddl).toContain("CONSTRAINT `chk_reservation_owner` CHECK (");
        expect(ddl).toContain("CONSTRAINT `chk_movement_single_source` CHECK (");
        expect(ddl).toContain("CONSTRAINT `chk_transfer_quantities` CHECK (");
        expect(ddl).toContain("CONSTRAINT `fk_inventory_reservations_transfer_item` FOREIGN KEY");
        expect(ddl).toContain("CONSTRAINT `fk_inventory_movements_return_item` FOREIGN KEY");
        expect(ddl).not.toMatch(/IF NOT EXISTS|DROP TABLE|sequelize\.sync/i);
    });

    it("rejects an existing inventory-owned table before issuing DDL", async () => {
        const { queryInterface, statements } = createQueryInterface(["inventories"]);
        await expect(migration.up(queryInterface)).rejects.toThrow(
            "refuses to run when any owned table already exists",
        );
        expect(statements).toEqual([]);
    });
});
