import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId, serializeMoney, type EntityId,
} from "../../../shared/contracts/database-scalars.js";

type OrderRow = {
    customerId: unknown | null; status: string; fulfillmentStatus: string; discountAmount: string;
};
type RedemptionRow = {
    id: unknown; voucherId: unknown; customerId: unknown | null;
    discountAmount: string; status: string;
};

export type VoucherTransitionV2Result =
    | { kind: "redeemed" | "released" | "replayed" }
    | { kind: "redemption_not_found" | "redemption_conflict" | "transition_not_allowed" };

/** The order status change and this transition must share the caller's transaction. */
export class SequelizeVoucherTransitionV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction: Transaction) {}

    async transition(input: { orderId: EntityId; action: "redeem" | "release" }): Promise<VoucherTransitionV2Result> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<OrderRow>(
            `SELECT customer_id AS customerId, status, fulfillment_status AS fulfillmentStatus,
                    discount_amount AS discountAmount FROM orders WHERE id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order) return { kind: "redemption_not_found" };
        const eligible = input.action === "redeem"
            ? order.status === "confirmed" && order.fulfillmentStatus === "unfulfilled"
            : order.status === "cancelled"
                && ["unfulfilled", "preparing", "ready_for_pickup", "cancelled"].includes(order.fulfillmentStatus);
        if (!eligible) return { kind: "transition_not_allowed" };

        // Discover the immutable FK without taking a row lock, then preserve the
        // order -> voucher -> redemption lock order shared with claim.
        const identity = (await sql.query<{ voucherId: unknown }>(
            "SELECT voucher_id AS voucherId FROM voucher_redemptions WHERE order_id = ?",
            { replacements: [input.orderId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!identity) return { kind: "redemption_not_found" };
        const voucherId = serializeDatabaseEntityId(identity.voucherId);
        const voucher = (await sql.query<{ id: unknown }>(
            "SELECT id FROM vouchers WHERE id = ? FOR UPDATE",
            { replacements: [voucherId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!voucher) return { kind: "redemption_conflict" };
        const redemption = (await sql.query<RedemptionRow>(
            `SELECT id, voucher_id AS voucherId, customer_id AS customerId,
                    discount_amount AS discountAmount, status
             FROM voucher_redemptions WHERE order_id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction: this.transaction, type: QueryTypes.SELECT },
        ))[0];
        const orderCustomerId = order.customerId === null ? null : serializeDatabaseEntityId(order.customerId);
        const redemptionCustomerId = redemption?.customerId === null || redemption?.customerId === undefined
            ? null : serializeDatabaseEntityId(redemption.customerId);
        if (!redemption || serializeDatabaseEntityId(redemption.voucherId) !== voucherId
            || redemptionCustomerId !== orderCustomerId
            || serializeMoney(redemption.discountAmount) !== serializeMoney(order.discountAmount)) {
            return { kind: "redemption_conflict" };
        }
        const nextStatus = input.action === "redeem" ? "redeemed" : "released";
        if (redemption.status === nextStatus) return { kind: "replayed" };
        if (redemption.status !== "reserved" && !(input.action === "release" && redemption.status === "redeemed")) {
            return { kind: "transition_not_allowed" };
        }
        const timestampColumn = input.action === "redeem" ? "redeemed_at" : "released_at";
        await sql.query(
            `UPDATE voucher_redemptions SET status = ?, ${timestampColumn} = UTC_TIMESTAMP(3)
             WHERE id = ? AND status = ?`,
            { replacements: [nextStatus, redemption.id, redemption.status], transaction: this.transaction },
        );
        return { kind: nextStatus };
    }
}
