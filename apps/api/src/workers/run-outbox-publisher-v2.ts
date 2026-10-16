import amqp from "amqplib";
import { parseWorkerEnv } from "../config/worker-env.js";
import { createV2Sequelize } from "../database/v2/connection.js";
import { createSalesV2Persistence } from "../database/v2/models.js";
import { RabbitMqOutboxV2Publisher } from "../infrastructure/events/rabbitmq-outbox-v2.publisher.js";
import { OutboxPublisherV2Worker } from "../modules/outbox/application/outbox-publisher-v2.worker.js";
import { SequelizeOutboxPublisherV2Repository } from "../modules/outbox/persistence/outbox-publisher-v2.repository.js";
import { logger } from "../observability/logger.js";

const workerEnv = parseWorkerEnv(process.env, "outbox");
const sequelize = createV2Sequelize(workerEnv.MYSQL_DATABASE, workerEnv);
const wait = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

const run = async (): Promise<void> => {
    await sequelize.authenticate();
    logger.info("outbox.v2.worker_started");
    const repository = new SequelizeOutboxPublisherV2Repository(createSalesV2Persistence(sequelize));
    while (!stopping) {
        try {
            const connection = await amqp.connect(workerEnv.RABBITMQ_URL);
            try {
                const channel = await connection.createConfirmChannel();
                try {
                    await channel.assertExchange("sales.domain-events", "topic", { durable: true });
                    logger.info("outbox.v2.broker_ready");
                    const worker = new OutboxPublisherV2Worker({
                        repository, publisher: new RabbitMqOutboxV2Publisher(channel),
                    });
                    while (!stopping) {
                        const result = await worker.runOnce();
                        if (result === "published") logger.info("outbox.v2.event_published");
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
