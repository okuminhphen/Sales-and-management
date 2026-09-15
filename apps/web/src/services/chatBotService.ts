import axios from "../middlewares/axiosConfig";
import type { AxiosResponse } from "axios";
import type { ChatbotResponse } from "../types/chatbot";

const sendMessage = (message: string): Promise<AxiosResponse<ChatbotResponse>> => {
  return axios.post<ChatbotResponse>("/bot/chat", { message });
};
export { sendMessage };
