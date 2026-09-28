import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { assertV2RuntimeReady, createV2RuntimePersistence } from "./database/v2/runtime.js";
import { logger } from "./observability/logger.js";
import { createApiV2Router } from "./routes/api-v2.js";
import { closeV2Socket, initV2Socket } from "./socket-v2.js";

const start = async (): Promise<void> => {
    const persistence = createV2RuntimePersistence();
    try {
        await persistence.sequelize.authenticate();
        await assertV2RuntimeReady(persistence);
        const redis = await connectRedis();

        const server = createServer(createApp({ apiRouter: createApiV2Router({ persistence }) }));
        await initV2Socket(server, persistence, redis);

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => reject(error);
            server.once("error", onError);
            server.listen(env.API_PORT, env.API_HOST, () => {
                server.off("error", onError);
                resolve();
            });
        });
        logger.info("server.started", { host: env.API_HOST, port: env.API_PORT });

        const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
            logger.info("server.shutdown_requested", { signal });
            server.close(async () => {
                await closeV2Socket();
                await disconnectRedis();
                await persistence.sequelize.close();
                process.exit(0);
            });
        };

        process.once("SIGINT", () => void shutdown("SIGINT"));
        process.once("SIGTERM", () => void shutdown("SIGTERM"));
    } catch (error) {
        await closeV2Socket().catch(() => undefined);
        await disconnectRedis().catch(() => undefined);
        await persistence.sequelize.close().catch(() => undefined);
        throw error;
    }
};

start().catch((error) => {
    logger.error("server.failed_to_start", { error });
    process.exit(1);
});
