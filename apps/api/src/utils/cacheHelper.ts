import { getReadyRedisClient } from "../config/redis.js";

/**
 * Xóa cache theo pattern
 * @param {string} pattern - Pattern để xóa cache (ví dụ: "product:*", "category:*")
 */
export const clearCacheByPattern = async (pattern: string): Promise<void> => {
    try {
        const redisClient = getReadyRedisClient();
        if (!redisClient) return;
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
            console.log(
                `✅ Đã xóa ${keys.length} cache keys với pattern: ${pattern}`
            );
        }
    } catch (error) {
        console.error(`❌ Lỗi khi xóa cache với pattern ${pattern}:`, error);
    }
};

/**
 * Xóa cache theo key cụ thể
 * @param {string} key - Key cần xóa
 */
export const clearCacheByKey = async (key: string): Promise<void> => {
    try {
        const redisClient = getReadyRedisClient();
        if (!redisClient) return;
        await redisClient.del(key);
        console.log(`✅ Đã xóa cache key: ${key}`);
    } catch (error) {
        console.error(`❌ Lỗi khi xóa cache key ${key}:`, error);
    }
};

/**
 * Xóa nhiều cache keys cùng lúc
 * @param {string[]} keys - Mảng các keys cần xóa
 */
export const clearMultipleCache = async (keys: string[]): Promise<void> => {
    try {
        const redisClient = getReadyRedisClient();
        if (!redisClient) return;
        if (keys.length > 0) {
            await redisClient.del(keys);
            console.log(`✅ Đã xóa ${keys.length} cache keys`);
        }
    } catch (error) {
        console.error(`❌ Lỗi khi xóa cache:`, error);
    }
};
