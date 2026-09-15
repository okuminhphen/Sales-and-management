import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../observability/logger.js";

const requestIdPattern = /^[a-zA-Z0-9_-]{8,128}$/;

const resolveRequestId = (request: Request): string => {
    const incoming = request.header("x-request-id");
    return incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();
};

export const requestContext = (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = performance.now();
    request.requestId = resolveRequestId(request);
    response.setHeader("X-Request-ID", request.requestId);

    response.on("finish", () => {
        logger.info("http.request.completed", {
            requestId: request.requestId,
            method: request.method,
            path: request.originalUrl,
            statusCode: response.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
        });
    });

    next();
};
