import axios from "axios";
import { env } from "../../config/env.js";
import { aiChatResponse, type ChatbotResponseDto } from "./chatbot.dto.js";

export const sendChatMessage = async (
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    requestId?: string,
): Promise<ChatbotResponseDto> => {
    const response = await axios.post(`${env.AI_SERVICE_URL}/chat`, { message, history }, {
        headers: requestId ? { "X-Request-ID": requestId } : undefined,
        timeout: env.AI_SERVICE_TIMEOUT_MS,
    });
    return aiChatResponse.parse(response.data);
};
