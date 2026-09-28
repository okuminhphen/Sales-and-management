export type ChatbotProductPayload = {
  id?: string;
  product_id?: string;
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
