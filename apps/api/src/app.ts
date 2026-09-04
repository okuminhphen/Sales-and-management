import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import configCors from "./config/cors.js";
import initApiRouter from "./routes/api.js";

export const createApp = (): Express => {
    const app = express();
    const appDirectory = path.dirname(fileURLToPath(import.meta.url));

    app.disable("x-powered-by");
    app.use(configureSecurityHeaders);
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
        (error: Error, _request: Request, response: Response, _next: NextFunction) => {
            console.error(error);
            response.status(500).json({
                error: { code: "INTERNAL_ERROR", message: "Internal server error" },
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
