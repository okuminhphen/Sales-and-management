import { z } from "zod";

export const transferReceiptIdParams = z.object({ id: z.coerce.number().int().positive() });
export const rejectionBody = z.object({ reason: z.string().trim().min(1).max(1000) });
