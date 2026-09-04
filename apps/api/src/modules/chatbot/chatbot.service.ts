import axios from "axios";
import { env } from "../../config/env.js";

export const sendChatMessage = async (message: string): Promise<unknown> => {
    const response = await axios.post(`${env.AI_SERVICE_URL}/chat`, { message });
    return response.data as unknown;
};
