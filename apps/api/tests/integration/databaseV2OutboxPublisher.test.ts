import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QueryTypes, Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createSalesV2Persistence } from "../../src/database/v2/models.js";
import { SequelizeOutboxPublisherV2Repository } from "../../src/modules/outbox/persistence/outbox-publisher-v2.repository.js";

describe.skipIf(process.env.RUN_DATABASE_V2_TESTS !== "true")("V2 outbox publisher lease on MySQL", () => {
    let db: Sequelize;
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const insertEvent = async (eventType: string, transaction?: import("sequelize").Transaction) => {
        const eventId = randomUUID();
        await db.query(`INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id,
            payload, occurred_at, created_at, updated_at)
            VALUES (?, ?, 'test', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [eventId, eventType, suffix, JSON.stringify({ product_id: "9007199254740993" })], transaction });
        return eventId;
    };

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) throw new Error("Explicit _test DB required.");
        await runV2Migrations("up");
        db = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
            dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
        });
        await db.authenticate();
    });
    afterAll(async () => { await db?.close(); });

    it("claims one event across competing workers and fences a stale publisher", async () => {
        const eventType = `test.outbox.${suffix}.lease`;
        const eventId = await insertEvent(eventType);
        const repository = new SequelizeOutboxPublisherV2Repository(createSalesV2Persistence(db), [eventType]);
        const claims = await Promise.all([repository.claimNext(), repository.claimNext()]);
        const first = claims.find((claim) => claim !== null);
        expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
        expect(first?.event.eventId).toBe(eventId);
        expect(first?.event.payload).toEqual({ product_id: "9007199254740993" });
        if (!first) throw new Error("Expected one claimed event.");
        expect(await repository.markPublished(first.id, first.attempt + 1)).toBe(false);
        expect(await repository.markFailed(first.id, first.attempt)).toBe(true);
        expect(await repository.claimNext()).toBeNull();
        await db.query("UPDATE outbox_events SET locked_at = UTC_TIMESTAMP(3) - INTERVAL 61 SECOND WHERE id = ?",
            { replacements: [first.id] });
        const second = await repository.claimNext();
        expect(second?.attempt).toBe(first.attempt + 1);
        expect(second?.event.eventId).toBe(eventId);
        expect(await repository.markPublished(first.id, first.attempt)).toBe(false);
        expect(await repository.markPublished(second!.id, second!.attempt)).toBe(true);
        expect(await repository.claimNext()).toBeNull();
        const rows = await db.query<{ attempts: number; publishedAt: Date | null }>(
            "SELECT attempts, published_at AS publishedAt FROM outbox_events WHERE event_id = ?",
            { replacements: [eventId], type: QueryTypes.SELECT });
        expect(rows[0]?.attempts).toBe(2);
        expect(rows[0]?.publishedAt).not.toBeNull();
    });

    it("cannot claim an event before its aggregate transaction commits", async () => {
        const eventType = `test.outbox.${suffix}.commit`;
        const repository = new SequelizeOutboxPublisherV2Repository(createSalesV2Persistence(db), [eventType]);
        const transaction = await db.transaction();
        let committed = false;
        try {
            const eventId = await insertEvent(eventType, transaction);
            expect(await repository.claimNext()).toBeNull();
            await transaction.commit();
            committed = true;
            const claimed = await repository.claimNext();
            expect(claimed?.event.eventId).toBe(eventId);
            expect(await repository.markPublished(claimed!.id, claimed!.attempt)).toBe(true);
        } catch (error) {
            if (!committed) await transaction.rollback();
            throw error;
        }
    });

    it("quarantines an invalid JSON shape without blocking later events", async () => {
        const eventType = `test.outbox.${suffix}.poison`;
        const badEventId = randomUUID();
        await db.query(`INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id,
            payload, occurred_at, created_at, updated_at)
            VALUES (?, ?, 'test', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [badEventId, eventType, suffix, JSON.stringify("not-an-object")] });
        const repository = new SequelizeOutboxPublisherV2Repository(createSalesV2Persistence(db), [eventType]);
        expect(await repository.claimNext()).toBeNull();
        const bad = (await db.query<{ attempts: number; lastError: string; publishedAt: Date | null }>(
            "SELECT attempts, last_error AS lastError, published_at AS publishedAt FROM outbox_events WHERE event_id = ?",
            { replacements: [badEventId], type: QueryTypes.SELECT }))[0];
        expect(bad).toEqual({ attempts: 20, lastError: "invalid_event_payload", publishedAt: null });
        const validEventId = await insertEvent(eventType);
        const valid = await repository.claimNext();
        expect(valid?.event.eventId).toBe(validEventId);
        expect(await repository.markPublished(valid!.id, valid!.attempt)).toBe(true);
    });
});
