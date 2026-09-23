import { describe, expect, it } from "vitest";
import type { QueryInterface } from "sequelize";
import migration from "../../src/database/v2/migrations/0001-identity-access.js";

const identityAccessTables = [
    "accounts",
    "roles",
    "permissions",
    "role_permissions",
    "account_roles",
    "customers",
    "customer_addresses",
    "branches",
    "employees",
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

describe("Database V2 identity/access baseline migration", () => {
    it("creates the reviewed identity, customer, and organization tables with key constraints", async () => {
        const { queryInterface, statements } = createQueryInterface();

        await migration.up(queryInterface);

        const ddl = statements.join("\n").replace(/\s+/g, " ");
        const createdTables = [...ddl.matchAll(/CREATE TABLE `([^`]+)`/g)].map(
            (match) => match[1],
        );

        expect(createdTables).toEqual(identityAccessTables);
        expect(ddl).toContain(
            "CONSTRAINT `uq_role_permissions_role_permission` UNIQUE (`role_id`, `permission_id`)",
        );
        expect(ddl).toContain(
            "CONSTRAINT `uq_account_roles_account_role_scope` UNIQUE (`account_id`, `role_id`, `scope_key`)",
        );
        expect(ddl).toContain(
            "CONSTRAINT `chk_account_role_scope` CHECK ((`scope_type` = 'global' AND `branch_id` IS NULL AND `scope_key` = 'GLOBAL') OR (`scope_type` = 'branch' AND `branch_id` IS NOT NULL AND `scope_key` = CONCAT('BRANCH:', `branch_id`)))",
        );
        expect(ddl).toContain(
            "CONSTRAINT `fk_branches_manager_employee` FOREIGN KEY (`manager_employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
        );
        expect(ddl).toContain(
            "KEY `idx_customer_addresses_customer` (`customer_id`)",
        );
        expect(ddl).toContain("KEY `idx_employees_branch` (`branch_id`)");
        expect(ddl).not.toMatch(/IF NOT EXISTS|DROP TABLE|sequelize\.sync/i);
    });

    it("fails closed before changing a target that already contains part of the baseline", async () => {
        const { queryInterface, statements } = createQueryInterface(["accounts"]);

        await expect(migration.up(queryInterface)).rejects.toThrow(
            "refuses to run when any owned table already exists",
        );
        expect(statements).toEqual([]);
    });
});
