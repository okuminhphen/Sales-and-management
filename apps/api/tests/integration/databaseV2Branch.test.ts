import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { seedV2Database } from "../../src/database/v2/seed.js";
import { BranchV2Service } from "../../src/modules/identity-access/application/branch-v2.service.js";
import { SequelizeBranchV2Repository } from "../../src/modules/identity-access/persistence/branch-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../../src/modules/identity-access/persistence/v2-access-context.repository.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";
const superAdmin = {
    email: "database-v2-branch-admin@example.test",
    password: "test-only-branch-seed-password",
};

describe.skipIf(!runDatabaseV2Tests)("Database V2 branch aggregate on MySQL", () => {
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

    it("creates, rejects a duplicate code, updates and lists branches without cross-domain side effects", async () => {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
        const code = `BRANCH_${suffix}`;
        const persistence = createSalesV2Persistence(sequelize);
        const contexts = new SequelizeV2AccessContextRepository(persistence);
        const actorRows = await sequelize.query<{ id: string }>(
            "SELECT id FROM accounts WHERE email = ?",
            { replacements: [superAdmin.email], type: QueryTypes.SELECT },
        );
        const actor = await contexts.findActiveByAccountId(actorRows[0]!.id);
        expect(actor).not.toBeNull();
        if (!actor) return;

        const branches = new SequelizeBranchV2Repository(persistence);
        const service = new BranchV2Service({ repository: branches });
        const created = await service.create(actor, {
            code,
            name: "HappyShop Integration Branch",
            address: "1 Integration Street",
            email: "BRANCH-INTEGRATION@EXAMPLE.TEST",
            type: "branch",
        });
        expect(created).toMatchObject({
            kind: "created",
            branch: {
                code,
                email: "branch-integration@example.test",
                managerEmployeeId: null,
                type: "branch",
            },
        });
        if (created.kind !== "created") return;

        await expect(service.create(actor, {
            code,
            name: "Duplicate branch",
            address: "2 Integration Street",
        })).resolves.toEqual({ kind: "branch_code_conflict" });
        await expect(service.update(actor, created.branch.id, {
            address: "3 Updated Integration Street",
            type: "central",
        })).resolves.toMatchObject({
            kind: "updated",
            branch: { id: created.branch.id, code, type: "central" },
        });
        await expect(service.get(actor, created.branch.id)).resolves.toMatchObject({
            kind: "branch",
            branch: { address: "3 Updated Integration Street" },
        });
        await expect(service.list(actor)).resolves.toMatchObject({
            kind: "branches",
            page: {
                branches: expect.arrayContaining([expect.objectContaining({ id: created.branch.id, code })]),
                limit: 20,
            },
        });
    });
});
