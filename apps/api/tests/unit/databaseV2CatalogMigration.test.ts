import type { QueryInterface } from "sequelize";
import { describe, expect, it } from "vitest";
import migration from "../../src/database/v2/migrations/0002-catalog.js";

const catalogTables = [
    "categories",
    "products",
    "sizes",
    "product_variants",
    "reviews",
    "banners",
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

describe("Database V2 catalog baseline migration", () => {
    it("creates the reviewed catalog tables, constraints, and key indexes", async () => {
        const { queryInterface, statements } = createQueryInterface([
            "accounts",
            "customers",
        ]);

        await migration.up(queryInterface);

        const ddl = statements.join("\n").replace(/\s+/g, " ");
        const createdTables = [...ddl.matchAll(/CREATE TABLE `([^`]+)`/g)].map(
            (match) => match[1],
        );

        expect(createdTables).toEqual(catalogTables);
        expect(ddl).toContain(
            "CONSTRAINT `chk_products_base_price` CHECK (`base_price` >= 0)",
        );
        expect(ddl).toContain(
            "CONSTRAINT `uq_product_variants_product_size` UNIQUE (`product_id`, `size_id`)",
        );
        expect(ddl).toContain(
            "CONSTRAINT `uq_reviews_customer_product` UNIQUE (`customer_id`, `product_id`)",
        );
        expect(ddl).toContain(
            "CONSTRAINT `chk_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5)",
        );
        expect(ddl).toContain(
            "KEY `idx_products_status_created` (`status`, `created_at`)",
        );
        expect(ddl).toContain(
            "KEY `idx_reviews_order_item` (`order_item_id`)",
        );
        expect(ddl).not.toMatch(/IF NOT EXISTS|DROP TABLE|sequelize\.sync/i);
    });

    it("fails closed before changing a target that already contains a catalog table", async () => {
        const { queryInterface, statements } = createQueryInterface(["products"]);

        await expect(migration.up(queryInterface)).rejects.toThrow(
            "refuses to run when any owned table already exists",
        );
        expect(statements).toEqual([]);
    });
});
