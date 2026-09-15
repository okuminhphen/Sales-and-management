import { z } from "zod";

const chatbotHistoryItem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000),
});

export const chatbotMessageBody = z.object({
  message: z.string().trim().min(1).max(5000),
  history: z.array(chatbotHistoryItem).max(6).default([]),
});
export type ChatbotMessageDto = z.infer<typeof chatbotMessageBody>;
