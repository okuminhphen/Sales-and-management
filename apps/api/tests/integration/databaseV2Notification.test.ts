import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { QueryTypes, Sequelize } from "sequelize";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { NotificationV2Service } from "../../src/modules/communication-ai/application/notification-v2.service.js";
import { createNotificationV2Router } from "../../src/modules/communication-ai/interfaces/http/notification-v2.routes.js";
import { SequelizeNotificationV2Repository } from "../../src/modules/communication-ai/persistence/notification-v2.repository.js";
import type { V2AuthenticatedRequest } from "../../src/modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { serializeDatabaseEntityId, serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

describe.skipIf(!runDatabaseV2Tests)("Notification V2 own-read persistence on MySQL", () => {
    let db: Sequelize;
    const suffix = randomUUID().slice(0, 8);
    let accountA = "";
    let accountB = "";
    let notificationA1 = "";
    let notificationA2 = "";
    let notificationA3 = "";
    let notificationB = "";

    const one = async <Row extends object>(sql: string, replacements: unknown[] = []): Promise<Row> => {
        const rows = await db.query<Row>(sql, { replacements, type: QueryTypes.SELECT });
        if (!rows[0]) throw new Error("Expected database row was not found.");
        return rows[0];
    };

    const createActiveAccount = async (label: string): Promise<string> => {
        const email = `notification-${label}-${suffix}@example.invalid`;
        await db.query(
            `INSERT INTO accounts (email, status, created_at, updated_at)
             VALUES (?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [email] },
        );
        return serializeDatabaseEntityId((await one<{ id: unknown }>(
            "SELECT id FROM accounts WHERE email = ?", [email],
        )).id);
    };

    const addNotification = async (
        accountId: string,
        title: string,
        createdAt: string,
    ): Promise<string> => {
        await db.query(
            `INSERT INTO notifications (recipient_account_id, type, title, content, data, read_at, created_at)
             VALUES (?, 'system', ?, 'Thông báo test an toàn', NULL, NULL, ?)`,
            { replacements: [accountId, title, createdAt] },
        );
        return serializeDatabaseEntityId((await one<{ id: unknown }>(
            "SELECT id FROM notifications WHERE recipient_account_id = ? AND title = ?", [accountId, title],
        )).id);
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        db = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
        });
        await db.authenticate();
        accountA = await createActiveAccount("a");
        accountB = await createActiveAccount("b");
        notificationA1 = await addNotification(accountA, `notification-a-1-${suffix}`, "2026-09-25 00:00:01.000");
        notificationA2 = await addNotification(accountA, `notification-a-2-${suffix}`, "2026-09-25 00:00:02.000");
        notificationA3 = await addNotification(accountA, `notification-a-3-${suffix}`, "2026-09-25 00:00:02.000");
        notificationB = await addNotification(accountB, `notification-b-${suffix}`, "2026-09-25 00:00:04.000");
    });

    afterAll(async () => db?.close());

    it("returns only an active account's newest-first page with a stable cursor", async () => {
        const repository = new SequelizeNotificationV2Repository(createSalesV2Persistence(db));
        const tieFirst = await repository.listOwn({
            accountId: serializeEntityId(accountA), beforeCreatedAt: null, beforeId: null, limit: 1,
        });
        if (tieFirst.kind !== "notifications" || !tieFirst.page.nextCursor) {
            throw new Error("Expected a cursor for the timestamp tie.");
        }
        expect(tieFirst.page.notifications.map(({ id }) => id)).toEqual([notificationA3]);
        const tieSecond = await repository.listOwn({
            accountId: serializeEntityId(accountA),
            beforeCreatedAt: tieFirst.page.nextCursor.beforeCreatedAt,
            beforeId: tieFirst.page.nextCursor.beforeId,
            limit: 1,
        });
        expect(tieSecond).toMatchObject({ kind: "notifications", page: { notifications: [{ id: notificationA2 }] } });

        const first = await repository.listOwn({
            accountId: serializeEntityId(accountA), beforeCreatedAt: null, beforeId: null, limit: 2,
        });
        expect(first.kind).toBe("notifications");
        if (first.kind !== "notifications") throw new Error("Expected notification page.");
        expect(first.page.notifications.map(({ id }) => id)).toEqual([notificationA3, notificationA2]);
        expect(first.page.notifications.every(({ type, title, content, readAt }) =>
            type === "system" && title.startsWith("notification-a-")
                && content === "Thông báo test an toàn" && readAt === null,
        )).toBe(true);
        expect(first.page.notifications[0]).not.toHaveProperty("data");
        expect(first.page.nextCursor).toEqual({
            beforeCreatedAt: first.page.notifications[1]?.createdAt,
            beforeId: notificationA2,
        });

        const second = await repository.listOwn({
            accountId: serializeEntityId(accountA),
            beforeCreatedAt: first.page.nextCursor?.beforeCreatedAt ?? null,
            beforeId: first.page.nextCursor?.beforeId ?? null,
            limit: 2,
        });
        expect(second).toMatchObject({ kind: "notifications", page: { nextCursor: null } });
        if (second.kind !== "notifications") throw new Error("Expected the final notification page.");
        expect(second.page.notifications.map(({ id }) => id)).toEqual([notificationA1]);

        const other = await repository.listOwn({
            accountId: serializeEntityId(accountB), beforeCreatedAt: null, beforeId: null, limit: 10,
        });
        expect(other).toMatchObject({ kind: "notifications", page: { notifications: [{ id: notificationB }] } });
    });

    it("executes the isolated HTTP factory with V2 identity and strict input validation", async () => {
        const auth: RequestHandler = (req, _res, next) => {
            (req as V2AuthenticatedRequest).v2AccessContext = {
                accountId: accountB, customerId: null, employeeId: null, grants: [],
            };
            next();
        };
        const app = express();
        app.use(express.json());
        app.use("/api/v1", createNotificationV2Router({ auth,
            notifications: new NotificationV2Service({
                repository: new SequelizeNotificationV2Repository(createSalesV2Persistence(db)),
            }),
        }));

        await request(app).get("/api/v1/notifications/my?limit=1").expect(200).expect((response) => {
            expect(response.body).toMatchObject({ EM: "Get notifications successfully", EC: 0,
                DT: [{ id: notificationB, type: "system" }], pagination: { nextCursor: null } });
            expect(response.body.DT[0]).not.toHaveProperty("data");
        });
        await request(app).get("/api/v1/notifications/count").expect(200)
            .expect({ EM: "Get unread notification count successfully", EC: 0, DT: 1 });
        await request(app).get("/api/v1/notifications/my?limit=1&unexpected=true").expect(400);
        await request(app).patch(`/api/v1/notifications/${notificationB}/read`).send({ unexpected: true }).expect(400);
        await request(app).patch(`/api/v1/notifications/${notificationB}/read`).send({}).expect(200)
            .expect({ EM: "Mark notification as read successfully", EC: 0,
                DT: { notificationId: notificationB, alreadyRead: false } });
        await request(app).patch(`/api/v1/notifications/${notificationB}/read`).send({}).expect(200)
            .expect({ EM: "Mark notification as read successfully", EC: 0,
                DT: { notificationId: notificationB, alreadyRead: true } });
        await request(app).get("/api/v1/notifications/count").expect(200)
            .expect({ EM: "Get unread notification count successfully", EC: 0, DT: 0 });
    });

    it("counts, marks only the owned row idempotently, and fails closed after account deactivation", async () => {
        const repository = new SequelizeNotificationV2Repository(createSalesV2Persistence(db));
        const owner = { accountId: serializeEntityId(accountA) };

        await expect(repository.countUnreadOwn(owner)).resolves.toEqual({ kind: "unread_count", count: 3 });
        await expect(repository.markOwnRead({ ...owner, notificationId: serializeEntityId(notificationA3) }))
            .resolves.toEqual({ kind: "marked" });
        await expect(repository.markOwnRead({ ...owner, notificationId: serializeEntityId(notificationA3) }))
            .resolves.toEqual({ kind: "already_read" });
        await expect(repository.countUnreadOwn(owner)).resolves.toEqual({ kind: "unread_count", count: 2 });
        await expect(repository.markOwnRead({
            accountId: serializeEntityId(accountB), notificationId: serializeEntityId(notificationA2),
        })).resolves.toEqual({ kind: "notification_not_found" });

        await db.query("UPDATE accounts SET status = 'inactive' WHERE id = ?", { replacements: [accountA] });
        await expect(repository.listOwn({ ...owner, beforeCreatedAt: null, beforeId: null, limit: 10 }))
            .resolves.toEqual({ kind: "notifications", page: { notifications: [], nextCursor: null } });
        await expect(repository.countUnreadOwn(owner)).resolves.toEqual({ kind: "unread_count", count: 0 });
        await expect(repository.markOwnRead({ ...owner, notificationId: serializeEntityId(notificationA2) }))
            .resolves.toEqual({ kind: "notification_not_found" });
    });
});
