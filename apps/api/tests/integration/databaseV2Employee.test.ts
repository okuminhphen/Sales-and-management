import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { EmployeeV2Service } from "../../src/modules/identity-access/application/employee-v2.service.js";
import { SequelizeEmployeeV2Repository } from "../../src/modules/identity-access/persistence/employee-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-employee-admin@example.test",
    password: "test-only-employee-seed-password",
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 employee aggregate on MySQL", () => {
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

    it("creates, updates and deactivates an employee without hard-deleting the history", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
        const branchCode = `BRANCH_${suffix}`;
        await sequelize.query(
            "INSERT INTO branches (code, name, address, type, created_at, updated_at) VALUES (?, ?, ?, 'branch', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            {
                replacements: [branchCode, "Employee integration branch", "1 Integration Street"],
                type: QueryTypes.INSERT,
            },
        );
        const branchRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM branches WHERE code = ?",
            { replacements: [branchCode], type: QueryTypes.SELECT },
        );
        const persistence = createSalesV2Persistence(sequelize);
        const contexts = new SequelizeV2AccessContextRepository(persistence);
        const superAdminRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM accounts WHERE email = ?",
            { replacements: [superAdmin.email], type: QueryTypes.SELECT },
        );
        const actor = await contexts.findActiveByAccountId(superAdminRows[0]!.id);
        expect(actor).not.toBeNull();
        if (!actor) return;

        const service = new EmployeeV2Service({
            repository: new SequelizeEmployeeV2Repository(persistence),
        });
        const code = `EMP_${suffix}`;
        const created = await service.create(actor, {
            branchId: branchRows[0]!.id,
            code,
            fullName: "Nguyễn Văn Integration",
            position: "Sales staff",
            salary: "10000000",
        });
        expect(created).toMatchObject({
            kind: "created",
            employee: {
                branchId: branchRows[0]!.id,
                code,
                salary: "10000000.0000",
                status: "active",
            },
        });
        if (created.kind !== "created") return;

        await expect(service.create(actor, {
            branchId: branchRows[0]!.id,
            code,
            fullName: "Duplicate employee",
        })).resolves.toEqual({ kind: "employee_code_conflict" });
        await expect(service.update(actor, created.employee.id, {
            fullName: "Nguyễn Văn Updated",
            salary: "12500000.5",
        })).resolves.toMatchObject({
            kind: "updated",
            employee: { fullName: "Nguyễn Văn Updated", salary: "12500000.5000" },
        });
        await expect(service.deactivate(actor, created.employee.id)).resolves.toMatchObject({
            kind: "deactivated",
            employee: { id: created.employee.id, status: "inactive" },
        });
        await expect(service.listByBranch(actor, branchRows[0]!.id)).resolves.toMatchObject({
            kind: "employees",
            employees: [expect.objectContaining({ id: created.employee.id, status: "inactive" })],
        });
    });
});
