import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId, serializeMoney, type EntityId, type Money,
} from "../../../shared/contracts/database-scalars.js";
import { calculateVoucherDiscountV2 } from "../application/voucher-pricing-v2.js";

type OrderRow = {
    id: unknown; customerId: unknown | null; branchId: unknown; channel: string;
    status: string; fulfillmentStatus: string; currency: string;
    subtotalAmount: string; discountAmount: string;
};
type VoucherRow = {
    id: unknown; code: string; discountType: "fixed" | "percent"; discountValue: string;
    minOrderAmount: string; maxDiscountAmount: string | null;
    usageLimit: number | null; perCustomerLimit: number | null;
    appliesToChannel: string; branchScope: string; status: string; inWindow: unknown;
};
type RedemptionRow = {
    id: unknown; voucherId: unknown; status: string; discountAmount: string;
    voucherCodeSnapshot: string;
};

export type VoucherClaimV2Result =
    | { kind: "claimed" | "replayed"; redemptionId: EntityId; discountAmount: Money }
    | { kind: "order_not_eligible" | "order_already_has_voucher" | "voucher_not_eligible"
        | "discount_mismatch" | "quota_exhausted" | "customer_quota_exhausted" };

/** An inner operation: checkout owns the outer transaction and must retry it as a unit. */
export class SequelizeVoucherClaimV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction: Transaction) {}

    async claim(input: { orderId: EntityId; code: string }): Promise<VoucherClaimV2Result> {
        if (typeof input.code !== "string" || input.code.length === 0 || input.code.length > 50
            || input.code.trim() !== input.code) return { kind: "voucher_not_eligible" };
        const sql = this.persistence.sequelize;
        const order = (await sql.query<OrderRow>(
            `SELECT id, customer_id AS customerId, fulfillment_branch_id AS branchId, channel,
                    status, fulfillment_status AS fulfillmentStatus, currency,
                    subtotal_amount AS subtotalAmount, discount_amount AS discountAmount
             FROM orders WHERE id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order || order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled"
            || order.currency !== "VND") return { kind: "order_not_eligible" };

        const voucher = (await sql.query<VoucherRow>(
            `SELECT id, code, discount_type AS discountType, discount_value AS discountValue,
                    min_order_amount AS minOrderAmount, max_discount_amount AS maxDiscountAmount,
                    usage_limit AS usageLimit, per_customer_limit AS perCustomerLimit,
                    applies_to_channel AS appliesToChannel, branch_scope AS branchScope, status,
                    (starts_at <= UTC_TIMESTAMP(3) AND ends_at > UTC_TIMESTAMP(3)) AS inWindow
             FROM vouchers WHERE code = ? FOR UPDATE`,
            { replacements: [input.code], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!voucher) return { kind: "voucher_not_eligible" };
        const voucherId = serializeDatabaseEntityId(voucher.id);
        // Lock order -> voucher -> redemption. The current read also sees a
        // concurrent committed claim even if checkout has an older snapshot.
        const prior = (await sql.query<RedemptionRow>(
            `SELECT id, voucher_id AS voucherId, status, discount_amount AS discountAmount,
                    voucher_code_snapshot AS voucherCodeSnapshot
             FROM voucher_redemptions WHERE order_id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (prior) {
            if (prior.voucherCodeSnapshot !== input.code
                || serializeDatabaseEntityId(prior.voucherId) !== voucherId || prior.status !== "reserved"
                || serializeMoney(prior.discountAmount) !== serializeMoney(order.discountAmount)) {
                return { kind: "order_already_has_voucher" };
            }
            return { kind: "replayed", redemptionId: serializeDatabaseEntityId(prior.id),
                discountAmount: serializeMoney(prior.discountAmount) };
        }

        // mysql2 may return computed booleans as "0"/"1" with bigNumberStrings.
        const inWindow = voucher.inWindow === 1 || voucher.inWindow === "1";
        if (voucher.status !== "active" || !inWindow
            || (voucher.appliesToChannel !== "all" && voucher.appliesToChannel !== order.channel)
            || BigInt(serializeMoney(order.subtotalAmount).replace(".", ""))
                < BigInt(serializeMoney(voucher.minOrderAmount).replace(".", ""))) {
            return { kind: "voucher_not_eligible" };
        }
        if (voucher.branchScope === "selected") {
            const assignments = await sql.query<{ branchId: unknown }>(
                "SELECT branch_id AS branchId FROM voucher_branches WHERE voucher_id = ? AND branch_id = ?",
                { replacements: [voucherId, order.branchId], transaction: this.transaction, type: QueryTypes.SELECT },
            );
            if (assignments.length === 0) return { kind: "voucher_not_eligible" };
        } else if (voucher.branchScope !== "all") return { kind: "voucher_not_eligible" };

        const customerId = order.customerId === null ? null : serializeDatabaseEntityId(order.customerId);
        if (voucher.perCustomerLimit !== null && customerId === null) return { kind: "voucher_not_eligible" };
        const discountAmount = calculateVoucherDiscountV2({
            subtotal: order.subtotalAmount, discountType: voucher.discountType,
            discountValue: voucher.discountValue, maxDiscountAmount: voucher.maxDiscountAmount,
        });
        if (discountAmount === "0.0000") return { kind: "voucher_not_eligible" };
        if (discountAmount !== serializeMoney(order.discountAmount)) return { kind: "discount_mismatch" };

        // Current reads are mandatory: the outer checkout may have established an
        // older REPEATABLE READ snapshot before it acquired this voucher lock.
        const usage = (await sql.query<{ total: number }>(
            `SELECT COUNT(*) AS total FROM voucher_redemptions
             WHERE voucher_id = ? AND status IN ('reserved', 'redeemed') FOR UPDATE`,
            { replacements: [voucherId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (voucher.usageLimit !== null && Number(usage?.total ?? 0) >= voucher.usageLimit) {
            return { kind: "quota_exhausted" };
        }
        if (voucher.perCustomerLimit !== null) {
            const customerUsage = (await sql.query<{ total: number }>(
                `SELECT COUNT(*) AS total FROM voucher_redemptions
                 WHERE voucher_id = ? AND customer_id = ? AND status IN ('reserved', 'redeemed') FOR UPDATE`,
                { replacements: [voucherId, customerId], transaction: this.transaction, type: QueryTypes.SELECT },
            ))[0];
            if (Number(customerUsage?.total ?? 0) >= voucher.perCustomerLimit) {
                return { kind: "customer_quota_exhausted" };
            }
        }
        await sql.query(
            `INSERT INTO voucher_redemptions (voucher_id, order_id, customer_id,
                voucher_code_snapshot, discount_amount, status, reserved_at)
             VALUES (?, ?, ?, ?, ?, 'reserved', UTC_TIMESTAMP(3))`,
            { replacements: [voucherId, input.orderId, customerId, voucher.code, discountAmount],
                transaction: this.transaction },
        );
        const created = (await sql.query<{ id: unknown }>(
            "SELECT id FROM voucher_redemptions WHERE order_id = ?",
            { replacements: [input.orderId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!created) throw new Error("Voucher claim insert could not be read back.");
        return { kind: "claimed", redemptionId: serializeDatabaseEntityId(created.id), discountAmount };
    }
}
