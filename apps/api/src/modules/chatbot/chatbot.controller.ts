import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import type { ChatbotMessageDto } from "./chatbot.dto.js";
import { sendChatMessage } from "./chatbot.service.js";

const sendMessageFunc = async (
    req: Request<Record<string, never>, unknown, ChatbotMessageDto>,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { message, history } = req.body;
        const requestId = res.getHeader("X-Request-ID");
        res.status(200).json(
            await sendChatMessage(message, history, typeof requestId === "string" ? requestId : undefined),
        );
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            res.status(502).json({
                EM: "AI service unavailable",
                EC: 2,
                DT: null,
            });
            return;
        }
        next(error);
    }
};
export default { sendMessageFunc };
