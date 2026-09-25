import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    DeliveryShipmentV2Repository, DeliveryShipmentV2Result, PendingDeliveryShipment,
} from "../application/delivery-shipment-v2.service.js";

type OrderRow = { id: unknown; fulfillmentType: string; status: string; fulfillmentStatus: string; totalAmount: string };
type ShipmentRow = {
    id: unknown; orderId: unknown; provider: string; providerRequestKey: string; recipientName: string;
    recipientPhone: string; shippingAddress: string; provinceId: number | null; districtId: number | null;
    wardCode: string | null; status: string; codAmount: string;
};
const scaled = (value: string): bigint => BigInt(serializeMoney(value).replace(".", ""));
const isSameShipment = (row: ShipmentRow, input: PendingDeliveryShipment): boolean =>
    serializeDatabaseEntityId(row.orderId) === input.orderId && row.provider === input.provider
    && row.providerRequestKey === input.providerRequestKey && row.recipientName === input.recipientName
    && row.recipientPhone === input.recipientPhone && row.shippingAddress === input.shippingAddress
    && row.provinceId === input.provinceId && row.districtId === input.districtId
    && row.wardCode === input.wardCode && row.status === "pending"
    && serializeMoney(row.codAmount) === input.codAmount;

/** Creates only the durable pending shipment row; booking a carrier happens after commit. */
export class SequelizeDeliveryShipmentV2Repository implements DeliveryShipmentV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    async create(input: PendingDeliveryShipment): Promise<DeliveryShipmentV2Result> {
        try {
            const work = (transaction: Transaction) => this.createLocked(input, transaction);
            return this.transaction ? await work(this.transaction)
                : await retryV2Transaction(() => this.persistence.inTransaction(work));
        } catch (error) {
            if (!this.transaction && (error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                return { kind: "idempotency_conflict" };
            }
            throw error;
        }
    }

    private async createLocked(input: PendingDeliveryShipment, transaction: Transaction): Promise<DeliveryShipmentV2Result> {
        const sql = this.persistence.sequelize;
        const order = (await sql.query<OrderRow>(
            `SELECT id, fulfillment_type AS fulfillmentType, status, fulfillment_status AS fulfillmentStatus,
                    total_amount AS totalAmount FROM orders WHERE id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!order) return { kind: "order_not_found" };
        if (order.fulfillmentType !== "delivery") return { kind: "order_not_delivery" };
        if (order.status !== "pending" || order.fulfillmentStatus !== "unfulfilled") return { kind: "order_not_pending" };
        if (scaled(input.codAmount) > scaled(order.totalAmount) || scaled(input.codAmount) % 10_000n !== 0n) {
            return { kind: "cod_amount_invalid" };
        }
        const byOrder = (await sql.query<ShipmentRow>(
            `SELECT id, order_id AS orderId, provider, provider_request_key AS providerRequestKey,
                    recipient_name AS recipientName, recipient_phone AS recipientPhone,
                    shipping_address AS shippingAddress, province_id AS provinceId, district_id AS districtId,
                    ward_code AS wardCode, status, cod_amount AS codAmount
             FROM shipments WHERE order_id = ? FOR UPDATE`,
            { replacements: [input.orderId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (byOrder) {
            return isSameShipment(byOrder, input)
                ? { kind: "replayed", shipmentId: serializeDatabaseEntityId(byOrder.id), provider: input.provider,
                    status: "pending", codAmount: input.codAmount }
                : { kind: "idempotency_conflict" };
        }
        const keyOwner = (await sql.query<{ orderId: unknown }>(
            "SELECT order_id AS orderId FROM shipments WHERE provider_request_key = ? FOR UPDATE",
            { replacements: [input.providerRequestKey], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (keyOwner) return { kind: "idempotency_conflict" };
        const [id] = await sql.query(
            `INSERT INTO shipments (order_id, provider, provider_request_key, provider_order_id, tracking_number,
                recipient_name, recipient_phone, shipping_address, province_id, district_id, ward_code,
                status, carrier_fee, cod_amount, created_at, updated_at)
             VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
            { replacements: [input.orderId, input.provider, input.providerRequestKey, input.recipientName,
                input.recipientPhone, input.shippingAddress, input.provinceId, input.districtId,
                input.wardCode, input.codAmount], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "created", shipmentId: serializeDatabaseEntityId(id), provider: input.provider,
            status: "pending", codAmount: input.codAmount };
    }
}
