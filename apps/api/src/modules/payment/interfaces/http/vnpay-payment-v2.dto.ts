import { z } from "zod";

const v2EntityId = z.string().regex(/^[1-9]\d{0,18}$/, "Must be a positive decimal entity ID.");

export const createVnPayPaymentBodyV2 = z.object({
    orderId: v2EntityId,
    requestKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/, "Invalid idempotency key."),
    locale: z.enum(["vn", "en"]).optional(),
    bankCode: z.string().regex(/^[A-Za-z0-9]{3,20}$/, "Invalid VNPay bank code.").optional(),
}).strict();

/**
 * The provider signs every `vnp_*` field. Keep the DTO extensible for future
 * official fields, but reject repeated/object values and any foreign query key.
 * Signature/semantic validation remains in the gateway adapter.
 */
export const vnpayCallbackQueryV2 = z.record(z.string(), z.string().min(1).max(512))
    .superRefine((value, context) => {
        for (const key of Object.keys(value)) {
            if (!key.startsWith("vnp_")) {
                context.addIssue({ code: "custom", path: [key], message: "Only VNPay callback fields are accepted." });
            }
        }
    });
