import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { sequelize } from "./models/index.js";
import { closeSocket, initSocket } from "./socket.js";

const start = async (): Promise<void> => {
    await sequelize.authenticate();
    const redis = await connectRedis();

    const server = createServer(createApp());
    await initSocket(server, redis);

    server.listen(env.API_PORT, env.API_HOST, () => {
        console.log(`API listening on http://${env.API_HOST}:${env.API_PORT}`);
    });

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
        console.log(`${signal} received, shutting down`);
        server.close(async () => {
            await closeSocket();
            await disconnectRedis();
            await sequelize.close();
            process.exit(0);
        });
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
};

start().catch((error) => {
    console.error("API failed to start", error);
    process.exit(1);
});
