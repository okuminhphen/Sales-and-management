import { z } from "zod";

const positiveId = z.coerce.number().int().positive();

export const createPaymentUrlBody = z.object({
    orderId: positiveId,
    bankCode: z.string().trim().max(30).optional(),
    orderType: z.string().trim().max(50).optional(),
    language: z.enum(["vn", "en"]).optional(),
}).passthrough();

export const paymentWebhookBody = z.object({
    data: z.object({
        description: z.string().trim().min(1),
        reference: z.union([z.string(), z.number()]).optional(),
    }).passthrough(),
}).passthrough();

export type CreatePaymentUrlDto = z.infer<typeof createPaymentUrlBody>;
export type PaymentWebhookDto = z.infer<typeof paymentWebhookBody>;
