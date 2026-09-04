import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import messageController from "./message.controller.js";
import { conversationIdParams, sendMessageBody } from "./message.dto.js";

export const createMessageRouter = (): Router => {
    const router = Router();
    router.post("/message/send/:conversationId", verifyToken, validateRequest({ params: conversationIdParams, body: sendMessageBody }), messageController.sendFunc);
    router.get("/message/get/:conversationId", verifyToken, validateRequest({ params: conversationIdParams }), messageController.getFunc);
    return router;
};
