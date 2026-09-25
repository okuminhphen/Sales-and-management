import { serializeEntityId, serializeMoney, type EntityId, type Money } from "../../../shared/contracts/database-scalars.js";

export type PendingDeliveryShipment = {
    orderId: EntityId; provider: string; providerRequestKey: string;
    recipientName: string; recipientPhone: string; shippingAddress: string;
    provinceId: number | null; districtId: number | null; wardCode: string | null; codAmount: Money;
};
export type DeliveryShipmentV2Result =
    | { kind: "created" | "replayed"; shipmentId: EntityId; provider: string; status: "pending"; codAmount: Money }
    | { kind: "order_not_found" | "order_not_delivery" | "order_not_pending" | "cod_amount_invalid"
        | "idempotency_conflict" };
export interface DeliveryShipmentV2Repository {
    create: (input: PendingDeliveryShipment) => Promise<DeliveryShipmentV2Result>;
}
export type DeliveryShipmentV2CommandResult = DeliveryShipmentV2Result
    | { kind: "invalid_shipment" | "shipment_unavailable" };

const requiredText = (value: unknown, maximum: number): string | null =>
    typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= maximum ? value : null;
const optionalPositiveInt = (value: unknown): number | null | undefined => {
    if (value === null) return null;
    return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2_147_483_647 ? Number(value) : undefined;
};
const optionalText = (value: unknown, maximum: number): string | null | undefined => {
    if (value === null) return null;
    return requiredText(value, maximum) ?? undefined;
};

/** Internal checkout primitive; carrier calls and HTTP validation are separate boundaries. */
export class DeliveryShipmentV2Service {
    constructor(private readonly dependencies: { repository: DeliveryShipmentV2Repository }) {}

    async create(input: {
        orderId: unknown; provider: unknown; providerRequestKey: unknown; recipientName: unknown;
        recipientPhone: unknown; shippingAddress: unknown; provinceId: unknown; districtId: unknown;
        wardCode: unknown; codAmount: unknown;
    }): Promise<DeliveryShipmentV2CommandResult> {
        let orderId: EntityId;
        let codAmount: Money;
        try {
            orderId = serializeEntityId(input.orderId);
            codAmount = serializeMoney(input.codAmount);
        } catch { return { kind: "invalid_shipment" }; }
        const provider = typeof input.provider === "string" && /^[a-z][a-z0-9_-]{0,49}$/.test(input.provider)
            ? input.provider : null;
        const providerRequestKey = typeof input.providerRequestKey === "string"
            && /^[A-Za-z0-9._:-]{1,191}$/.test(input.providerRequestKey) ? input.providerRequestKey : null;
        const recipientName = requiredText(input.recipientName, 255);
        const recipientPhone = requiredText(input.recipientPhone, 30);
        const shippingAddress = requiredText(input.shippingAddress, 500);
        const provinceId = optionalPositiveInt(input.provinceId);
        const districtId = optionalPositiveInt(input.districtId);
        const wardCode = optionalText(input.wardCode, 50);
        if (!provider || !providerRequestKey || !recipientName || !recipientPhone || !shippingAddress
            || provinceId === undefined || districtId === undefined || wardCode === undefined) {
            return { kind: "invalid_shipment" };
        }
        try {
            return await this.dependencies.repository.create({ orderId, provider, providerRequestKey,
                recipientName, recipientPhone, shippingAddress, provinceId, districtId, wardCode, codAmount });
        } catch { return { kind: "shipment_unavailable" }; }
    }
}
