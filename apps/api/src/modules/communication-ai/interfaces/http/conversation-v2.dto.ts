import { z } from "zod";

const entityId = z.string().regex(/^[1-9]\d{0,18}$/).pipe(z.string().refine(
    (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
));

export const openConversationBodyV2 = z.object({}).strict();
export const conversationMessageParamsV2 = z.object({ conversationId: entityId }).strict();
export const customerMessageBodyV2 = z.object({
    clientMessageId: z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/),
    message: z.string().trim().min(1).max(5_000),
}).strict();
export const customerMessageHistoryQueryV2 = z.object({
    beforeSeq: entityId.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
