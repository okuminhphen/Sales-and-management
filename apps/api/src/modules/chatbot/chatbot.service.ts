import axios from "axios";
import { env } from "../../config/env.js";

export const sendChatMessage = async (
    message: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    requestId?: string,
): Promise<unknown> => {
    const response = await axios.post(`${env.AI_SERVICE_URL}/chat`, { message, history }, {
        headers: requestId ? { "X-Request-ID": requestId } : undefined,
        timeout: env.AI_SERVICE_TIMEOUT_MS,
    });
    return response.data as unknown;
};
