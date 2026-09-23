import {
    DataTypes,
    Model,
    type Optional,
    type Sequelize,
} from "sequelize";
import {
    v2ModelOptions,
    type V2PersistenceModule,
} from "../../../database/v2/persistence.js";

type Timestamps = { createdAt: Date; updatedAt: Date };
type BigIntId = string;
type Money = string;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";
type FulfillmentStatus = "unfulfilled" | "preparing" | "ready_for_pickup" | "shipping" | "fulfilled" | "exception" | "cancelled";
type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
type ShipmentStatus = "pending" | "booked" | "shipping" | "delivered" | "failed" | "returning" | "returned" | "cancelled";
type ReturnStatus = "requested" | "approved" | "received" | "inspected" | "completed" | "rejected" | "cancelled";

export type CartAttributes = Timestamps & { id: BigIntId; customerId: BigIntId };
export type CartItemAttributes = Timestamps & { id: BigIntId; cartId: BigIntId; productVariantId: BigIntId; quantity: number };
export type OrderAttributes = Timestamps & {
    id: BigIntId; code: string; checkoutKey: string; customerId: BigIntId | null;
    fulfillmentBranchId: BigIntId; createdByAccountId: BigIntId | null; channel: "online" | "in_store";
    fulfillmentType: "delivery" | "store_pickup" | "carry_out"; fulfillmentStatus: FulfillmentStatus;
    status: OrderStatus; currency: string; subtotalAmount: Money; discountAmount: Money; shippingFee: Money;
    totalAmount: Money; customerName: string | null; customerEmail: string | null; customerPhone: string | null;
    customerMessage: string | null; cancelledAt: Date | null; cancelledByAccountId: BigIntId | null;
    cancellationReason: string | null; fulfilledAt: Date | null; placedAt: Date;
};
export type OrderItemAttributes = {
    id: BigIntId; orderId: BigIntId; productId: BigIntId | null; productVariantId: BigIntId | null;
    skuSnapshot: string; productNameSnapshot: string; sizeNameSnapshot: string; imageSnapshot: JsonValue | null;
    unitPrice: Money; discountAmount: Money; quantity: number; lineTotal: Money; createdAt: Date;
};
export type OrderStatusHistoryAttributes = {
    id: BigIntId; orderId: BigIntId; fromStatus: OrderStatus | null; toStatus: OrderStatus;
    fromFulfillmentStatus: FulfillmentStatus | null; toFulfillmentStatus: FulfillmentStatus;
    changedByAccountId: BigIntId | null; note: string | null; changedAt: Date;
};
export type VoucherAttributes = Timestamps & {
    id: BigIntId; code: string; description: string | null; discountType: "percent" | "fixed";
    discountValue: Money; minOrderAmount: Money; maxDiscountAmount: Money | null; usageLimit: number | null;
    perCustomerLimit: number | null; appliesToChannel: "all" | "online" | "in_store";
    branchScope: "all" | "selected"; startsAt: Date; endsAt: Date;
    status: "draft" | "active" | "inactive" | "expired";
};
export type VoucherBranchAttributes = { voucherId: BigIntId; branchId: BigIntId };
export type VoucherRedemptionAttributes = {
    id: BigIntId; voucherId: BigIntId; orderId: BigIntId; customerId: BigIntId | null;
    voucherCodeSnapshot: string; discountAmount: Money; status: "reserved" | "redeemed" | "released";
    reservedAt: Date; redeemedAt: Date | null; releasedAt: Date | null;
};
export type PaymentMethodAttributes = Timestamps & {
    id: BigIntId; code: string; name: string; description: string | null; isActive: boolean;
};
export type PaymentAttributes = Timestamps & {
    id: BigIntId; orderId: BigIntId; paymentMethodId: BigIntId; collectedByAccountId: BigIntId | null;
    provider: string; merchantReference: string; providerTransactionId: string | null; amount: Money;
    status: PaymentStatus; paidAt: Date | null;
};
export type PaymentEventAttributes = {
    id: BigIntId; paymentId: BigIntId; provider: string; eventKey: string; eventType: string;
    verifiedAt: Date; processedAt: Date | null; createdAt: Date;
};
export type ShipmentAttributes = Timestamps & {
    id: BigIntId; orderId: BigIntId; provider: string; providerRequestKey: string;
    providerOrderId: string | null; trackingNumber: string | null; recipientName: string; recipientPhone: string;
    shippingAddress: string; provinceId: number | null; districtId: number | null; wardCode: string | null;
    status: ShipmentStatus; carrierFee: Money | null; codAmount: Money; shippedAt: Date | null;
    deliveredAt: Date | null; returnedAt: Date | null;
};
export type ShipmentEventAttributes = {
    id: BigIntId; shipmentId: BigIntId; eventKey: string; status: ShipmentStatus; occurredAt: Date;
    receivedAt: Date; processedAt: Date | null;
};
export type ReturnAttributes = Timestamps & {
    id: BigIntId; code: string; requestKey: string; orderId: BigIntId; receivingBranchId: BigIntId;
    createdByAccountId: BigIntId | null; approvedByAccountId: BigIntId | null; processedByAccountId: BigIntId | null;
    status: ReturnStatus; reason: string; approvedAt: Date | null; receivedAt: Date | null;
    inspectedAt: Date | null; completedAt: Date | null;
};
export type ReturnItemAttributes = Timestamps & {
    id: BigIntId; returnId: BigIntId; orderItemId: BigIntId; requestedQuantity: number;
    approvedQuantity: number; receivedQuantity: number; restockedQuantity: number; nonSellableQuantity: number;
    approvedRefundAmount: Money; note: string | null;
};
export type RefundAttributes = Timestamps & {
    id: BigIntId; paymentId: BigIntId; returnId: BigIntId | null; idempotencyKey: string;
    providerRefundId: string | null; amount: Money; status: PaymentStatus; reason: string;
    requestedByAccountId: BigIntId | null; approvedByAccountId: BigIntId | null;
    processedByAccountId: BigIntId | null; completedAt: Date | null;
};

type New<Attributes extends { id: unknown }> = Optional<Attributes, "id">;
const bigintId = () => ({ type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true });
const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
};
const money = () => DataTypes.DECIMAL(19, 4);
const orderStatus = () => DataTypes.ENUM("pending", "confirmed", "completed", "cancelled");
const fulfillmentStatus = () => DataTypes.ENUM("unfulfilled", "preparing", "ready_for_pickup", "shipping", "fulfilled", "exception", "cancelled");
const paymentStatus = () => DataTypes.ENUM("pending", "processing", "completed", "failed", "cancelled");
const shipmentStatus = () => DataTypes.ENUM("pending", "booked", "shipping", "delivered", "failed", "returning", "returned", "cancelled");
const returnStatus = () => DataTypes.ENUM("requested", "approved", "received", "inspected", "completed", "rejected", "cancelled");

export const createCommercePersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const Cart = sequelize.define<Model<CartAttributes, New<CartAttributes>>>("Cart", {
        id: bigintId(), customerId: { type: DataTypes.BIGINT, allowNull: false, field: "customer_id" }, ...timestamps,
    }, v2ModelOptions("carts"));
    const CartItem = sequelize.define<Model<CartItemAttributes, New<CartItemAttributes>>>("CartItem", {
        id: bigintId(), cartId: { type: DataTypes.BIGINT, allowNull: false, field: "cart_id" },
        productVariantId: { type: DataTypes.BIGINT, allowNull: false, field: "product_variant_id" },
        quantity: { type: DataTypes.INTEGER, allowNull: false }, ...timestamps,
    }, v2ModelOptions("cart_items"));
    const Order = sequelize.define<Model<OrderAttributes, New<OrderAttributes>>>("Order", {
        id: bigintId(), code: { type: DataTypes.STRING(50), allowNull: false },
        checkoutKey: { type: DataTypes.STRING(191), allowNull: false, field: "checkout_key" },
        customerId: { type: DataTypes.BIGINT, allowNull: true, field: "customer_id" },
        fulfillmentBranchId: { type: DataTypes.BIGINT, allowNull: false, field: "fulfillment_branch_id" },
        createdByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "created_by_account_id" },
        channel: { type: DataTypes.ENUM("online", "in_store"), allowNull: false },
        fulfillmentType: { type: DataTypes.ENUM("delivery", "store_pickup", "carry_out"), allowNull: false, field: "fulfillment_type" },
        fulfillmentStatus: { type: fulfillmentStatus(), allowNull: false, field: "fulfillment_status" },
        status: { type: orderStatus(), allowNull: false }, currency: { type: DataTypes.CHAR(3), allowNull: false },
        subtotalAmount: { type: money(), allowNull: false, field: "subtotal_amount" },
        discountAmount: { type: money(), allowNull: false, field: "discount_amount" },
        shippingFee: { type: money(), allowNull: false, field: "shipping_fee" },
        totalAmount: { type: money(), allowNull: false, field: "total_amount" },
        customerName: { type: DataTypes.STRING(255), allowNull: true, field: "customer_name" },
        customerEmail: { type: DataTypes.STRING(255), allowNull: true, field: "customer_email" },
        customerPhone: { type: DataTypes.STRING(30), allowNull: true, field: "customer_phone" },
        customerMessage: { type: DataTypes.STRING(1000), allowNull: true, field: "customer_message" },
        cancelledAt: { type: DataTypes.DATE, allowNull: true, field: "cancelled_at" },
        cancelledByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "cancelled_by_account_id" },
        cancellationReason: { type: DataTypes.STRING(500), allowNull: true, field: "cancellation_reason" },
        fulfilledAt: { type: DataTypes.DATE, allowNull: true, field: "fulfilled_at" },
        placedAt: { type: DataTypes.DATE, allowNull: false, field: "placed_at" }, ...timestamps,
    }, v2ModelOptions("orders"));
    const OrderItem = sequelize.define<Model<OrderItemAttributes, New<OrderItemAttributes>>>("OrderItem", {
        id: bigintId(), orderId: { type: DataTypes.BIGINT, allowNull: false, field: "order_id" },
        productId: { type: DataTypes.BIGINT, allowNull: true, field: "product_id" },
        productVariantId: { type: DataTypes.BIGINT, allowNull: true, field: "product_variant_id" },
        skuSnapshot: { type: DataTypes.STRING(100), allowNull: false, field: "sku_snapshot" },
        productNameSnapshot: { type: DataTypes.STRING(255), allowNull: false, field: "product_name_snapshot" },
        sizeNameSnapshot: { type: DataTypes.STRING(100), allowNull: false, field: "size_name_snapshot" },
        imageSnapshot: { type: DataTypes.JSON, allowNull: true, field: "image_snapshot" },
        unitPrice: { type: money(), allowNull: false, field: "unit_price" },
        discountAmount: { type: money(), allowNull: false, field: "discount_amount" },
        quantity: { type: DataTypes.INTEGER, allowNull: false }, lineTotal: { type: money(), allowNull: false, field: "line_total" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("order_items"));
    const OrderStatusHistory = sequelize.define<Model<OrderStatusHistoryAttributes, New<OrderStatusHistoryAttributes>>>("OrderStatusHistory", {
        id: bigintId(), orderId: { type: DataTypes.BIGINT, allowNull: false, field: "order_id" },
        fromStatus: { type: orderStatus(), allowNull: true, field: "from_status" },
        toStatus: { type: orderStatus(), allowNull: false, field: "to_status" },
        fromFulfillmentStatus: { type: fulfillmentStatus(), allowNull: true, field: "from_fulfillment_status" },
        toFulfillmentStatus: { type: fulfillmentStatus(), allowNull: false, field: "to_fulfillment_status" },
        changedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "changed_by_account_id" },
        note: { type: DataTypes.STRING(500), allowNull: true }, changedAt: { type: DataTypes.DATE, allowNull: false, field: "changed_at" },
    }, v2ModelOptions("order_status_history"));
    const Voucher = sequelize.define<Model<VoucherAttributes, New<VoucherAttributes>>>("Voucher", {
        id: bigintId(), code: { type: DataTypes.STRING(50), allowNull: false }, description: { type: DataTypes.STRING(500), allowNull: true },
        discountType: { type: DataTypes.ENUM("percent", "fixed"), allowNull: false, field: "discount_type" },
        discountValue: { type: money(), allowNull: false, field: "discount_value" },
        minOrderAmount: { type: money(), allowNull: false, field: "min_order_amount" },
        maxDiscountAmount: { type: money(), allowNull: true, field: "max_discount_amount" },
        usageLimit: { type: DataTypes.INTEGER, allowNull: true, field: "usage_limit" },
        perCustomerLimit: { type: DataTypes.INTEGER, allowNull: true, field: "per_customer_limit" },
        appliesToChannel: { type: DataTypes.ENUM("all", "online", "in_store"), allowNull: false, field: "applies_to_channel" },
        branchScope: { type: DataTypes.ENUM("all", "selected"), allowNull: false, field: "branch_scope" },
        startsAt: { type: DataTypes.DATE, allowNull: false, field: "starts_at" },
        endsAt: { type: DataTypes.DATE, allowNull: false, field: "ends_at" },
        status: { type: DataTypes.ENUM("draft", "active", "inactive", "expired"), allowNull: false }, ...timestamps,
    }, v2ModelOptions("vouchers"));
    const VoucherBranch = sequelize.define<Model<VoucherBranchAttributes, VoucherBranchAttributes>>("VoucherBranch", {
        voucherId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, field: "voucher_id" },
        branchId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, field: "branch_id" },
    }, v2ModelOptions("voucher_branches"));
    const VoucherRedemption = sequelize.define<Model<VoucherRedemptionAttributes, New<VoucherRedemptionAttributes>>>("VoucherRedemption", {
        id: bigintId(), voucherId: { type: DataTypes.BIGINT, allowNull: false, field: "voucher_id" },
        orderId: { type: DataTypes.BIGINT, allowNull: false, field: "order_id" },
        customerId: { type: DataTypes.BIGINT, allowNull: true, field: "customer_id" },
        voucherCodeSnapshot: { type: DataTypes.STRING(50), allowNull: false, field: "voucher_code_snapshot" },
        discountAmount: { type: money(), allowNull: false, field: "discount_amount" },
        status: { type: DataTypes.ENUM("reserved", "redeemed", "released"), allowNull: false },
        reservedAt: { type: DataTypes.DATE, allowNull: false, field: "reserved_at" },
        redeemedAt: { type: DataTypes.DATE, allowNull: true, field: "redeemed_at" },
        releasedAt: { type: DataTypes.DATE, allowNull: true, field: "released_at" },
    }, v2ModelOptions("voucher_redemptions"));

    return {
        name: "commerce",
        models: [
            { name: "Cart", model: Cart }, { name: "CartItem", model: CartItem }, { name: "Order", model: Order },
            { name: "OrderItem", model: OrderItem }, { name: "OrderStatusHistory", model: OrderStatusHistory },
            { name: "Voucher", model: Voucher }, { name: "VoucherBranch", model: VoucherBranch },
            { name: "VoucherRedemption", model: VoucherRedemption },
        ],
        associate: () => {
            Cart.hasMany(CartItem, { foreignKey: "cartId", as: "items" });
            CartItem.belongsTo(Cart, { foreignKey: "cartId", as: "cart" });
            Order.hasMany(OrderItem, { foreignKey: "orderId", as: "items" });
            OrderItem.belongsTo(Order, { foreignKey: "orderId", as: "order" });
            Order.hasMany(OrderStatusHistory, { foreignKey: "orderId", as: "statusHistory" });
            OrderStatusHistory.belongsTo(Order, { foreignKey: "orderId", as: "order" });
            Voucher.hasMany(VoucherBranch, { foreignKey: "voucherId", as: "branchAssignments" });
            VoucherBranch.belongsTo(Voucher, { foreignKey: "voucherId", as: "voucher" });
            Voucher.hasMany(VoucherRedemption, { foreignKey: "voucherId", as: "redemptions" });
            VoucherRedemption.belongsTo(Voucher, { foreignKey: "voucherId", as: "voucher" });
            Order.hasOne(VoucherRedemption, { foreignKey: "orderId", as: "voucherRedemption" });
            VoucherRedemption.belongsTo(Order, { foreignKey: "orderId", as: "order" });
        },
    };
};

export const createPaymentFulfillmentPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const PaymentMethod = sequelize.define<Model<PaymentMethodAttributes, New<PaymentMethodAttributes>>>("PaymentMethod", {
        id: bigintId(), code: { type: DataTypes.STRING(50), allowNull: false }, name: { type: DataTypes.STRING(150), allowNull: false },
        description: { type: DataTypes.STRING(500), allowNull: true }, isActive: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_active" },
        ...timestamps,
    }, v2ModelOptions("payment_methods"));
    const Payment = sequelize.define<Model<PaymentAttributes, New<PaymentAttributes>>>("Payment", {
        id: bigintId(), orderId: { type: DataTypes.BIGINT, allowNull: false, field: "order_id" },
        paymentMethodId: { type: DataTypes.BIGINT, allowNull: false, field: "payment_method_id" },
        collectedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "collected_by_account_id" },
        provider: { type: DataTypes.STRING(50), allowNull: false },
        merchantReference: { type: DataTypes.STRING(191), allowNull: false, field: "merchant_reference" },
        providerTransactionId: { type: DataTypes.STRING(191), allowNull: true, field: "provider_transaction_id" },
        amount: { type: money(), allowNull: false }, status: { type: paymentStatus(), allowNull: false },
        paidAt: { type: DataTypes.DATE, allowNull: true, field: "paid_at" }, ...timestamps,
    }, v2ModelOptions("payments"));
    const PaymentEvent = sequelize.define<Model<PaymentEventAttributes, New<PaymentEventAttributes>>>("PaymentEvent", {
        id: bigintId(), paymentId: { type: DataTypes.BIGINT, allowNull: false, field: "payment_id" },
        provider: { type: DataTypes.STRING(50), allowNull: false }, eventKey: { type: DataTypes.STRING(191), allowNull: false, field: "event_key" },
        eventType: { type: DataTypes.STRING(100), allowNull: false, field: "event_type" },
        verifiedAt: { type: DataTypes.DATE, allowNull: false, field: "verified_at" },
        processedAt: { type: DataTypes.DATE, allowNull: true, field: "processed_at" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("payment_events"));
    const Shipment = sequelize.define<Model<ShipmentAttributes, New<ShipmentAttributes>>>("Shipment", {
        id: bigintId(), orderId: { type: DataTypes.BIGINT, allowNull: false, field: "order_id" },
        provider: { type: DataTypes.STRING(50), allowNull: false },
        providerRequestKey: { type: DataTypes.STRING(191), allowNull: false, field: "provider_request_key" },
        providerOrderId: { type: DataTypes.STRING(191), allowNull: true, field: "provider_order_id" },
        trackingNumber: { type: DataTypes.STRING(191), allowNull: true, field: "tracking_number" },
        recipientName: { type: DataTypes.STRING(255), allowNull: false, field: "recipient_name" },
        recipientPhone: { type: DataTypes.STRING(30), allowNull: false, field: "recipient_phone" },
        shippingAddress: { type: DataTypes.STRING(500), allowNull: false, field: "shipping_address" },
        provinceId: { type: DataTypes.INTEGER, allowNull: true, field: "province_id" },
        districtId: { type: DataTypes.INTEGER, allowNull: true, field: "district_id" },
        wardCode: { type: DataTypes.STRING(50), allowNull: true, field: "ward_code" },
        status: { type: shipmentStatus(), allowNull: false }, carrierFee: { type: money(), allowNull: true, field: "carrier_fee" },
        codAmount: { type: money(), allowNull: false, field: "cod_amount" },
        shippedAt: { type: DataTypes.DATE, allowNull: true, field: "shipped_at" },
        deliveredAt: { type: DataTypes.DATE, allowNull: true, field: "delivered_at" },
        returnedAt: { type: DataTypes.DATE, allowNull: true, field: "returned_at" }, ...timestamps,
    }, v2ModelOptions("shipments"));
    const ShipmentEvent = sequelize.define<Model<ShipmentEventAttributes, New<ShipmentEventAttributes>>>("ShipmentEvent", {
        id: bigintId(), shipmentId: { type: DataTypes.BIGINT, allowNull: false, field: "shipment_id" },
        eventKey: { type: DataTypes.STRING(191), allowNull: false, field: "event_key" }, status: { type: shipmentStatus(), allowNull: false },
        occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
        receivedAt: { type: DataTypes.DATE, allowNull: false, field: "received_at" },
        processedAt: { type: DataTypes.DATE, allowNull: true, field: "processed_at" },
    }, v2ModelOptions("shipment_events"));
    const Return = sequelize.define<Model<ReturnAttributes, New<ReturnAttributes>>>("Return", {
        id: bigintId(), code: { type: DataTypes.STRING(50), allowNull: false }, requestKey: { type: DataTypes.STRING(191), allowNull: false, field: "request_key" },
        orderId: { type: DataTypes.BIGINT, allowNull: false, field: "order_id" },
        receivingBranchId: { type: DataTypes.BIGINT, allowNull: false, field: "receiving_branch_id" },
        createdByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "created_by_account_id" },
        approvedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "approved_by_account_id" },
        processedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "processed_by_account_id" },
        status: { type: returnStatus(), allowNull: false }, reason: { type: DataTypes.STRING(500), allowNull: false },
        approvedAt: { type: DataTypes.DATE, allowNull: true, field: "approved_at" },
        receivedAt: { type: DataTypes.DATE, allowNull: true, field: "received_at" },
        inspectedAt: { type: DataTypes.DATE, allowNull: true, field: "inspected_at" },
        completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" }, ...timestamps,
    }, v2ModelOptions("returns"));
    const ReturnItem = sequelize.define<Model<ReturnItemAttributes, New<ReturnItemAttributes>>>("ReturnItem", {
        id: bigintId(), returnId: { type: DataTypes.BIGINT, allowNull: false, field: "return_id" },
        orderItemId: { type: DataTypes.BIGINT, allowNull: false, field: "order_item_id" },
        requestedQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "requested_quantity" },
        approvedQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "approved_quantity" },
        receivedQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "received_quantity" },
        restockedQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "restocked_quantity" },
        nonSellableQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "non_sellable_quantity" },
        approvedRefundAmount: { type: money(), allowNull: false, field: "approved_refund_amount" },
        note: { type: DataTypes.STRING(500), allowNull: true }, ...timestamps,
    }, v2ModelOptions("return_items"));
    const Refund = sequelize.define<Model<RefundAttributes, New<RefundAttributes>>>("Refund", {
        id: bigintId(), paymentId: { type: DataTypes.BIGINT, allowNull: false, field: "payment_id" },
        returnId: { type: DataTypes.BIGINT, allowNull: true, field: "return_id" },
        idempotencyKey: { type: DataTypes.STRING(191), allowNull: false, field: "idempotency_key" },
        providerRefundId: { type: DataTypes.STRING(191), allowNull: true, field: "provider_refund_id" },
        amount: { type: money(), allowNull: false }, status: { type: paymentStatus(), allowNull: false },
        reason: { type: DataTypes.STRING(500), allowNull: false },
        requestedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "requested_by_account_id" },
        approvedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "approved_by_account_id" },
        processedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "processed_by_account_id" },
        completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" }, ...timestamps,
    }, v2ModelOptions("refunds"));

    return {
        name: "payment-fulfillment",
        models: [
            { name: "PaymentMethod", model: PaymentMethod }, { name: "Payment", model: Payment },
            { name: "PaymentEvent", model: PaymentEvent }, { name: "Shipment", model: Shipment },
            { name: "ShipmentEvent", model: ShipmentEvent }, { name: "Return", model: Return },
            { name: "ReturnItem", model: ReturnItem }, { name: "Refund", model: Refund },
        ],
        associate: () => {
            PaymentMethod.hasMany(Payment, { foreignKey: "paymentMethodId", as: "payments" });
            Payment.belongsTo(PaymentMethod, { foreignKey: "paymentMethodId", as: "paymentMethod" });
            Payment.hasMany(PaymentEvent, { foreignKey: "paymentId", as: "events" });
            PaymentEvent.belongsTo(Payment, { foreignKey: "paymentId", as: "payment" });
            Shipment.hasMany(ShipmentEvent, { foreignKey: "shipmentId", as: "events" });
            ShipmentEvent.belongsTo(Shipment, { foreignKey: "shipmentId", as: "shipment" });
            Return.hasMany(ReturnItem, { foreignKey: "returnId", as: "items" });
            ReturnItem.belongsTo(Return, { foreignKey: "returnId", as: "return" });
            Payment.hasMany(Refund, { foreignKey: "paymentId", as: "refunds" });
            Refund.belongsTo(Payment, { foreignKey: "paymentId", as: "payment" });
            Return.hasMany(Refund, { foreignKey: "returnId", as: "refunds" });
            Refund.belongsTo(Return, { foreignKey: "returnId", as: "return" });
        },
    };
};
