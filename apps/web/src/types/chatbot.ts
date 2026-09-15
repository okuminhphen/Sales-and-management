export type ChatbotProductPayload = {
  id?: number;
  product_id?: number;
  name?: string;
  description?: string;
  price?: number | string;
  image?: unknown;
  images?: unknown;
};

export type ChatbotResponse = {
  reply: string;
  products: ChatbotProductPayload[];
};
