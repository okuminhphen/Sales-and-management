import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId,
    serializeMoney,
} from "../../../shared/contracts/database-scalars.js";
import type {
    ActiveVoucher,
    VoucherDirectoryV2Repository,
} from "../application/voucher-directory-v2.service.js";

type VoucherRow = {
    id: unknown;
    code: string;
    description: string | null;
    discountType: "percent" | "fixed";
    discountValue: string;
    minOrderAmount: string;
    maxDiscountAmount: string | null;
    usageLimit: number | null;
    usedCount: number | string;
    endsAt: Date | string;
};

const toIsoTimestamp = (value: Date | string): string => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError("Voucher end timestamp is invalid.");
    return date.toISOString();
};

export class SequelizeVoucherDirectoryV2Repository implements VoucherDirectoryV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listActiveOnlineVouchers(): Promise<readonly ActiveVoucher[]> {
        const rows = await this.persistence.sequelize.query<VoucherRow>(
            `SELECT v.id, v.code, v.description, v.discount_type AS discountType,
                    v.discount_value AS discountValue, v.min_order_amount AS minOrderAmount,
                    v.max_discount_amount AS maxDiscountAmount, v.usage_limit AS usageLimit,
                    v.ends_at AS endsAt,
                    SUM(CASE WHEN vr.status IN ('reserved', 'redeemed') THEN 1 ELSE 0 END) AS usedCount
             FROM vouchers v
             LEFT JOIN voucher_redemptions vr ON vr.voucher_id = v.id
             WHERE v.status = 'active'
               AND v.applies_to_channel IN ('all', 'online')
               AND CURRENT_TIMESTAMP(3) BETWEEN v.starts_at AND v.ends_at
             GROUP BY v.id, v.code, v.description, v.discount_type, v.discount_value,
                      v.min_order_amount, v.max_discount_amount, v.usage_limit, v.ends_at
             HAVING v.usage_limit IS NULL OR usedCount < v.usage_limit
             ORDER BY v.ends_at ASC, v.code ASC`,
            { type: QueryTypes.SELECT },
        );

        return rows.map((row) => {
            const usedCount = Number(row.usedCount);
            if (!Number.isSafeInteger(usedCount) || usedCount < 0) {
                throw new TypeError("Voucher usage count is invalid.");
            }
            return {
                id: serializeDatabaseEntityId(row.id),
                code: row.code,
                description: row.description,
                discountType: row.discountType,
                discountValue: serializeMoney(row.discountValue),
                minOrderAmount: serializeMoney(row.minOrderAmount),
                maxDiscountAmount: row.maxDiscountAmount === null
                    ? null : serializeMoney(row.maxDiscountAmount),
                remainingUses: row.usageLimit === null ? null : Math.max(0, row.usageLimit - usedCount),
                endsAt: toIsoTimestamp(row.endsAt),
            };
        });
    }
}
