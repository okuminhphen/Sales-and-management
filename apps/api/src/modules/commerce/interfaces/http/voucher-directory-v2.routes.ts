import { Router } from "express";
import type { VoucherDirectoryV2Service } from "../../application/voucher-directory-v2.service.js";

export const createVoucherDirectoryV2Router = (service: VoucherDirectoryV2Service): Router => {
    const router = Router();
    router.get("/voucher/read", async (_request, response) => {
        const result = await service.listActiveOnline();
        if (result.kind === "voucher_directory_unavailable") {
            response.status(503).json({ EM: "Voucher directory unavailable", EC: -1, DT: null });
            return;
        }
        response.status(200).json({
            EM: "Get active vouchers successfully",
            EC: 0,
            DT: result.vouchers.map((voucher) => ({
                id: voucher.id,
                code: voucher.code,
                description: voucher.description,
                discount_type: voucher.discountType,
                discount_value: voucher.discountValue,
                min_order_value: voucher.minOrderAmount,
                max_discount_amount: voucher.maxDiscountAmount,
                quantity: voucher.remainingUses,
                expires_at: voucher.endsAt,
            })),
        });
    });
    return router;
};
