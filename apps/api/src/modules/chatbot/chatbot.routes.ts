import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import botController from "./chatbot.controller.js";
import { chatbotMessageBody } from "./chatbot.dto.js";

export const createChatbotRouter = (): Router => {
    const router = Router();
    router.post("/bot/chat", validateRequest({ body: chatbotMessageBody }), botController.sendMessageFunc);
    return router;
};
