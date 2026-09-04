import type { NextFunction, Request, Response } from "express";
import { getReadyRedisClient } from "../config/redis.js";

export const cache = (keyPrefix: string) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const redisClient = getReadyRedisClient();
        if (!redisClient) {
            next();
            return;
        }
        // Tạo cache key dựa trên prefix và params/query
        let key = keyPrefix;
        if (req.params.id) {
            key = `${keyPrefix}:${req.params.id}`;
        } else if (req.params.userId) {
            key = `${keyPrefix}:${req.params.userId}`;
        } else if (req.params.branchId) {
            key = `${keyPrefix}:${req.params.branchId}`;
        } else if (req.params.productId) {
            key = `${keyPrefix}:${req.params.productId}`;
        } else if (req.params.categoryId) {
            key = `${keyPrefix}:${req.params.categoryId}`;
        } else if (req.params.adminId) {
            key = `${keyPrefix}:${req.params.adminId}`;
        } else if (req.params.employeeId) {
            key = `${keyPrefix}:${req.params.employeeId}`;
        } else if (req.query.userId) {
            key = `${keyPrefix}:${String(req.query.userId)}`;
        } else {
            key = `${keyPrefix}:all`;
        }

        const cachedData = await redisClient.get(key);

        if (cachedData) {
            res.json(JSON.parse(String(cachedData)));
            return;
        }

        // Lưu response gốc
        const originalJson = res.json.bind(res);

        // Override res.json để cache response
        res.json = ((body: unknown) => {
            try {
                void redisClient.set(key, JSON.stringify(body), { EX: 300 });
            } catch (error) {
                console.error("Error caching data:", error);
            }
            return originalJson(body);
        }) as Response["json"];

        next();
    } catch (error) {
        console.error("Cache middleware error:", error);
        next();
    }
};
