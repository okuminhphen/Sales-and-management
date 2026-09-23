import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createV2ModelRegistry } from "../../src/database/v2/persistence.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createIdentityAccessPersistenceModule } from "../../src/modules/identity-access/persistence/identity-access.models.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

const expectedColumns = {
    Account: ["id", "email", "username", "password_hash", "status", "email_verified_at", "last_login_at", "created_at", "updated_at"],
    Role: ["id", "code", "name", "description", "created_at", "updated_at"],
    Permission: ["id", "code", "description", "created_at", "updated_at"],
    RolePermission: ["id", "role_id", "permission_id", "created_at"],
    AccountRole: ["id", "account_id", "role_id", "scope_type", "scope_key", "branch_id", "assigned_by_account_id", "assigned_at"],
    Customer: ["id", "account_id", "full_name", "phone", "status", "loyalty_points", "created_at", "updated_at"],
    CustomerAddress: ["id", "customer_id", "recipient_name", "recipient_phone", "address_line", "province_id", "district_id", "ward_code", "is_default", "created_at", "updated_at"],
    Branch: ["id", "code", "name", "address", "phone", "email", "type", "manager_employee_id", "created_at", "updated_at"],
    Employee: ["id", "account_id", "branch_id", "code", "full_name", "position", "phone", "email", "salary", "status", "hired_at", "created_at", "updated_at"],
} as const;

describe.skipIf(!runDatabaseV2Tests)("Database V2 identity/access typed models on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => sequelize?.close());

    it("maps each identity-access model to its complete V2 table and composes associations", async () => {
        const module = createIdentityAccessPersistenceModule(sequelize);
        expect(() => createV2ModelRegistry([module])).not.toThrow();
        expect(module.models.map(({ name }) => name).sort()).toEqual(Object.keys(expectedColumns).sort());

        for (const { name, model } of module.models) {
            const tableName = model.getTableName() as string;
            const fields = Object.entries(model.getAttributes())
                .map(([attributeName, attribute]) => attribute.field ?? attributeName)
                .sort();
            const table = await sequelize.getQueryInterface().describeTable(tableName);
            expect(fields).toEqual([...expectedColumns[name as keyof typeof expectedColumns]].sort());
            expect(Object.keys(table).sort()).toEqual(fields);
        }
    });
});
