import { z } from "zod";

export const conversationIdParams = z.object({ conversationId: z.coerce.number().int().positive() });
export const sendMessageBody = z.object({ message: z.string().trim().min(1).max(5000) });
export type SendMessageDto = z.infer<typeof sendMessageBody>;
