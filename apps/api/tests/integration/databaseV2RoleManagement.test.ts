import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { RoleManagementV2Service } from "../../src/modules/identity-access/application/role-management-v2.service.js";
import { SequelizeRoleManagementV2Repository } from "../../src/modules/identity-access/persistence/role-management-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-role-management-admin@example.test",
    password: "test-only-role-management-seed-password",
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 role management on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST,
            port: env.MYSQL_PORT,
            dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true },
            logging: false,
        });
        await sequelize.authenticate();
        await seedV2Database(sequelize, superAdmin);
    });

    afterAll(async () => {
        await sequelize?.close();
    });

    it("persists an atomic custom-role permission mapping and protects referenced or seeded roles", async () => {
        const persistence = createSalesV2Persistence(sequelize);
        const contexts = new SequelizeV2AccessContextRepository(persistence);
        const superAdminRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM accounts WHERE email = ?",
            { replacements: [superAdmin.email], type: QueryTypes.SELECT },
        );
        const actor = await contexts.findActiveByAccountId(superAdminRows[0]!.id);
        expect(actor).not.toBeNull();
        if (!actor) return;

        const service = new RoleManagementV2Service({
            repository: new SequelizeRoleManagementV2Repository(persistence),
        });
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
        const code = `ANALYTICS_${suffix}`;
        const created = await service.createRole(actor, {
            code,
            name: "Analytics viewer",
            permissionCodes: ["audit.read.global"],
        });
        expect(created).toMatchObject({
            kind: "created",
            role: { code, permissionCodes: ["audit.read.global"] },
        });
        if (created.kind !== "created") return;

        await expect(service.createRole(actor, {
            code,
            name: "Duplicate role",
            permissionCodes: ["audit.read.global"],
        })).resolves.toEqual({ kind: "role_code_conflict" });

        const updated = await service.updateRole(actor, created.role.id, {
            name: "Updated analytics viewer",
            description: null,
            permissionCodes: ["audit.read.global", "behavior.read.global"],
        });
        expect(updated).toMatchObject({
            kind: "updated",
            role: {
                id: created.role.id,
                name: "Updated analytics viewer",
                description: null,
                permissionCodes: ["audit.read.global", "behavior.read.global"],
            },
        });

        const accountEmail = `role-recipient-${suffix.toLowerCase()}@example.test`;
        await sequelize.query(
            "INSERT INTO accounts (email, password_hash, status, created_at, updated_at) VALUES (?, NULL, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [accountEmail], type: QueryTypes.INSERT },
        );
        const accountRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM accounts WHERE email = ?",
            { replacements: [accountEmail], type: QueryTypes.SELECT },
        );
        await sequelize.query(
            "INSERT INTO account_roles (account_id, role_id, scope_type, scope_key, branch_id, assigned_by_account_id, assigned_at) VALUES (?, ?, 'global', 'GLOBAL', NULL, ?, UTC_TIMESTAMP(3))",
            {
                replacements: [accountRows[0]!.id, created.role.id, actor.accountId],
                type: QueryTypes.INSERT,
            },
        );
        await expect(contexts.findActiveByAccountId(accountRows[0]!.id)).resolves.toMatchObject({
            grants: [{
                roleCode: code,
                scope: { type: "global" },
                permissions: ["audit.read.global", "behavior.read.global"],
            }],
        });

        await expect(service.deleteRole(actor, created.role.id)).resolves.toEqual({ kind: "role_in_use" });
        const systemRoleRows = await sequelize.query<{ id: number }>(
            "SELECT id FROM roles WHERE code = 'SUPER_ADMIN'",
            { type: QueryTypes.SELECT },
        );
        await expect(service.updateRole(actor, systemRoleRows[0]!.id, { name: "Cannot edit seed" }))
            .resolves.toEqual({ kind: "system_role_immutable" });

        await sequelize.query(
            "DELETE FROM account_roles WHERE account_id = ? AND role_id = ?",
            { replacements: [accountRows[0]!.id, created.role.id], type: QueryTypes.DELETE },
        );
        await expect(service.deleteRole(actor, created.role.id)).resolves.toEqual({ kind: "deleted" });
    });
});
