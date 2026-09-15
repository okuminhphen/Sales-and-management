import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { env } from "../../config/env.js";
import botController from "./chatbot.controller.js";
import { chatbotMessageBody } from "./chatbot.dto.js";

export const createChatbotRouter = (): Router => {
    const router = Router();
    router.post(
        "/bot/chat",
        rateLimit({
            keyPrefix: "rate-limit:chat",
            maxRequests: env.CHAT_RATE_LIMIT_MAX,
            windowSeconds: env.CHAT_RATE_LIMIT_WINDOW_SECONDS,
        }),
        validateRequest({ body: chatbotMessageBody }),
        botController.sendMessageFunc,
    );
    return router;
};
