import amqp from "amqplib";
import { Sequelize } from "sequelize";
import { env } from "../config/env.js";
import { createSalesV2Persistence } from "../database/v2/models.js";
import { RabbitMqOutboxV2Publisher } from "../infrastructure/events/rabbitmq-outbox-v2.publisher.js";
import { OutboxPublisherV2Worker } from "../modules/outbox/application/outbox-publisher-v2.worker.js";
import { SequelizeOutboxPublisherV2Repository } from "../modules/outbox/persistence/outbox-publisher-v2.repository.js";
import { logger } from "../observability/logger.js";

if (process.env.V2_OUTBOX_PUBLISHER_ENABLED !== "true") {
    throw new Error("Set V2_OUTBOX_PUBLISHER_ENABLED=true only after Database V2 cutover/rehearsal.");
}

const sequelize = new Sequelize(env.MYSQL_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
    host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
    dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
});
const wait = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

const run = async (): Promise<void> => {
    await sequelize.authenticate();
    const repository = new SequelizeOutboxPublisherV2Repository(createSalesV2Persistence(sequelize));
    while (!stopping) {
        try {
            const connection = await amqp.connect(env.RABBITMQ_URL);
            try {
                const channel = await connection.createConfirmChannel();
                try {
                    await channel.assertExchange("sales.domain-events", "topic", { durable: true });
                    const worker = new OutboxPublisherV2Worker({
                        repository, publisher: new RabbitMqOutboxV2Publisher(channel),
                    });
                    while (!stopping) {
                        const result = await worker.runOnce();
                        if (result === "idle") await wait(1_000);
                        if (result === "failed" || result === "lease_lost") {
                            logger.error("outbox.v2.publish_retry_scheduled", { outcome: result });
                            break;
                        }
                    }
                } finally { await channel.close().catch(() => undefined); }
            } finally { await connection.close().catch(() => undefined); }
        } catch (error) {
            logger.error("outbox.v2.worker_error", { errorName: error instanceof Error ? error.name : "UnknownError" });
        }
        if (!stopping) await wait(5_000);
    }
};

run().catch((error) => {
    logger.error("outbox.v2.worker_stopped", { errorName: error instanceof Error ? error.name : "UnknownError" });
    process.exitCode = 1;
}).finally(async () => sequelize.close());
