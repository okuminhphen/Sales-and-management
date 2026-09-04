import cors from "cors";
import type { Express } from "express";
import { env } from "./env.js";

const allowedOrigins = env.FRONTEND_URL.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const configCors = (app: Express): void => {
    app.use(
        cors({
            credentials: true,
            origin(origin, callback) {
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                    return;
                }
                callback(new Error(`Origin is not allowed by CORS: ${origin}`));
            },
        })
    );
};

export default configCors;
