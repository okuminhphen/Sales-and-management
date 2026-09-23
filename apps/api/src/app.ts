import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import configCors from "./config/cors.js";
import { requestContext } from "./middlewares/requestContext.js";
import { logger } from "./observability/logger.js";
import initApiRouter from "./routes/api.js";

export const createApp = (): Express => {
    const app = express();
    const appDirectory = path.dirname(fileURLToPath(import.meta.url));

    app.disable("x-powered-by");
    if (process.env.NODE_ENV === "production") {
        app.set("trust proxy", 1);
    } else {
        app.set("trust proxy", false);
    }
    app.use(configureSecurityHeaders);
    app.use(requestContext);
    configCors(app);
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(cookieParser());
    app.use("/uploads", express.static(path.resolve(appDirectory, "../uploads")));

    app.get("/health/live", (_request, response) => {
        response.status(200).json({ status: "ok" });
    });

    initApiRouter(app);

    app.use((_request, response) => {
        response.status(404).json({
            error: { code: "NOT_FOUND", message: "Route not found" },
        });
    });

    app.use(
        (error: Error, request: Request, response: Response, _next: NextFunction) => {
            logger.error("http.request.failed", {
                requestId: request.requestId,
                method: request.method,
                path: request.originalUrl,
                error,
            });
            response.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Internal server error",
                    requestId: request.requestId,
                },
            });
        }
    );

    return app;
};

const configureSecurityHeaders = (
    _request: Request,
    response: Response,
    next: NextFunction
): void => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
};
