import amqp from "amqplib";
import { Op } from "sequelize";
import { env } from "../config/env.js";
import db from "../models/index.js";
import { logger } from "../observability/logger.js";

const exchange = "sales.domain-events";

const publishConfirmed = (channel: amqp.ConfirmChannel, routingKey: string, body: Buffer): Promise<void> =>
    new Promise((resolve, reject) => {
        channel.publish(exchange, routingKey, body, { contentType: "application/json", persistent: true }, (error) =>
            error ? reject(error) : resolve()
        );
    });

/** At-least-once publisher. Consumers deduplicate safely using eventId. */
export const publishOutboxBatch = async (): Promise<number> => {
    const connection = await amqp.connect(env.RABBITMQ_URL);
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(exchange, "topic", { durable: true });
    try {
        const events = await db.OutboxEvent.findAll({
            where: { publishedAt: null, attempts: { [Op.lt]: 20 } },
            order: [["id", "ASC"]],
            limit: env.OUTBOX_BATCH_SIZE,
        });
        for (const event of events) {
            try {
                await publishConfirmed(channel, event.eventType, Buffer.from(JSON.stringify(event.toJSON())));
                await event.update({ publishedAt: new Date(), lockedAt: null, lastError: null });
            } catch (error) {
                await event.update({
                    attempts: Number(event.attempts) + 1,
                    lockedAt: new Date(),
                    lastError: error instanceof Error ? error.message.slice(0, 2_000) : "publish failed",
                });
                logger.error("outbox.publish.failed", { eventId: event.eventId, error });
            }
        }
        return events.length;
    } finally {
        await channel.close();
        await connection.close();
    }
};
