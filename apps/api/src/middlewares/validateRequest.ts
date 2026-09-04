import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

export interface RequestContract {
    body?: ZodType;
    params?: ZodType;
    query?: ZodType;
}

export const validateRequest = (contract: RequestContract): RequestHandler =>
    (request: Request, response: Response, next: NextFunction): void => {
        for (const key of ["params", "query", "body"] as const) {
            const schema = contract[key];
            if (!schema) continue;
            const result = schema.safeParse(request[key]);
            if (!result.success) {
                response.status(400).json({
                    EM: "Request validation failed",
                    EC: 1,
                    DT: null,
                    errors: result.error.issues.map((issue) => ({
                        path: [key, ...issue.path].join("."),
                        message: issue.message,
                    })),
                });
                return;
            }
            if (key === "query") Object.assign(request.query, result.data);
            else request[key] = result.data as never;
        }
        next();
    };
