import type { QueryInterface } from "sequelize";
import { describe, expect, it } from "vitest";
import migration from "../../src/database/v2/migrations/0003-commerce.js";

const ownedTables = [
    "carts",
    "cart_items",
    "orders",
    "order_items",
    "order_status_history",
    "vouchers",
    "voucher_branches",
    "voucher_redemptions",
    "payment_methods",
    "payments",
    "payment_events",
];

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

describe("Database V2 commerce baseline migration", () => {
    it("creates cart, order, voucher and payment tables with reviewed constraints", async () => {
        const { queryInterface, statements } = createQueryInterface();
        await migration.up(queryInterface);

        const ddl = statements.join("\n").replace(/\s+/g, " ");
        const tableNames = [...ddl.matchAll(/CREATE TABLE `([^`]+)`/g)].map(
            (match) => match[1],
        );
        expect(tableNames).toEqual(ownedTables);
        expect(ddl).toContain("UNIQUE KEY `uq_orders_checkout_key` (`checkout_key`)");
        expect(ddl).toContain("CONSTRAINT `chk_order_amounts` CHECK (");
        expect(ddl).toContain("CONSTRAINT `chk_order_item_amounts` CHECK (");
        expect(ddl).toContain("CONSTRAINT `chk_cart_items_quantity` CHECK (`quantity` > 0)");
        expect(ddl).toContain("CONSTRAINT `uq_payment_provider_transaction` UNIQUE (`provider`, `provider_transaction_id`)");
        expect(ddl).toContain("CONSTRAINT `fk_reviews_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT");
        expect(ddl).not.toMatch(/IF NOT EXISTS|DROP TABLE|sequelize\.sync/i);
    });

    it("rejects a partially existing commerce baseline before issuing DDL", async () => {
        const { queryInterface, statements } = createQueryInterface(["orders"]);
        await expect(migration.up(queryInterface)).rejects.toThrow(
            "refuses to run when any owned table already exists",
        );
        expect(statements).toEqual([]);
    });
});
