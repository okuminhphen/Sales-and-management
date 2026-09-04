import { z } from "zod";

export const chatbotMessageBody = z.object({ message: z.string().trim().min(1).max(5000) });
export type ChatbotMessageDto = z.infer<typeof chatbotMessageBody>;
