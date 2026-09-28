import { z } from "zod";
import { v2EntityId } from "../../shared/contracts/v2-entity-id.dto.js";

const chatbotHistoryItem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000),
});

export const chatbotMessageBody = z.object({
  message: z.string().trim().min(1).max(5000),
  history: z.array(chatbotHistoryItem).max(6).default([]),
});
export type ChatbotMessageDto = z.infer<typeof chatbotMessageBody>;

const canonicalMoney = z.string().regex(/^(0|[1-9]\d{0,14})\.\d{4}$/);
const httpImageUrl = z.string().max(2048).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Expected an HTTP(S) image URL");

export const aiProductPayload = z.object({
  product_id: v2EntityId,
  name: z.string().min(1).max(255),
  description: z.string().max(10_000),
  price: canonicalMoney,
  images: z.union([z.array(httpImageUrl).max(20), httpImageUrl, z.null()]),
  category_name: z.string().min(1).max(255),
}).strict();

export const aiChatResponse = z.object({
  reply: z.string().min(1).max(10_000),
  products: z.array(aiProductPayload).max(50),
}).strict();

export const aiRecommendationResponse = z.array(aiProductPayload).max(50);

export const aiPersonalizedRecommendationResponse = z.object({
  user_id: v2EntityId,
  recommendations: aiRecommendationResponse,
}).strict();

export type ChatbotResponseDto = z.infer<typeof aiChatResponse>;
