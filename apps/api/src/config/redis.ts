import { createClient, type RedisClientType } from "@redis/client";
import { env } from "./env.js";

let redisClient: RedisClientType | undefined;

export const getRedisClient = (): RedisClientType => {
    if (!redisClient) {
        redisClient = createClient({ url: env.REDIS_URL });
        redisClient.on("error", (error) => {
            console.error("Redis error", error);
        });
    }

    return redisClient;
};

export const connectRedis = async (): Promise<RedisClientType> => {
    const client = getRedisClient();
    if (!client.isOpen) {
        await client.connect();
    }
    return client;
};

export const disconnectRedis = async (): Promise<void> => {
    if (redisClient?.isOpen) {
        await redisClient.quit();
    }
};

export const getReadyRedisClient = (): RedisClientType | undefined =>
    redisClient?.isReady ? redisClient : undefined;
