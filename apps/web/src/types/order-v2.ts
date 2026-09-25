import type { V2CatalogImage } from "./catalog-v2";
import type { V2EntityId, V2Money, V2OffsetPagination } from "./database-v2";

export type V2OrderChannel = "online" | "in_store";
export type V2FulfillmentType = "delivery" | "store_pickup" | "carry_out";
export type V2FulfillmentStatus =
  | "unfulfilled"
  | "preparing"
  | "ready_for_pickup"
  | "shipping"
  | "fulfilled"
  | "exception"
  | "cancelled";
export type V2OrderStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type V2ShipmentStatus =
  | "pending"
  | "booked"
  | "shipping"
  | "delivered"
  | "failed"
  | "returning"
  | "returned"
  | "cancelled";

export interface V2OrderItem {
  id: V2EntityId;
  orderId: V2EntityId;
  productId: V2EntityId | null;
  skuSnapshot: string;
  productName: string;
  productSize: string;
  productImage: readonly V2CatalogImage[] | null;
  quantity: number;
  priceAtOrder: V2Money;
  discountAmount: V2Money;
  totalPrice: V2Money;
}

export interface V2OrderShipment {
  id: V2EntityId;
  provider: string;
  status: V2ShipmentStatus;
  trackingNumber: string | null;
  codAmount: V2Money;
  shippedAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
}

/** Immutable read model for both own and back-office V2 order reads. */
export interface V2Order {
  id: V2EntityId;
  code: string;
  customerId: V2EntityId | null;
  branchId: V2EntityId;
  channel: V2OrderChannel;
  fulfillmentType: V2FulfillmentType;
  fulfillmentStatus: V2FulfillmentStatus;
  orderDate: string;
  totalPrice: V2Money;
  subtotalAmount: V2Money;
  discountAmount: V2Money;
  shippingFee: V2Money;
  status: V2OrderStatus;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipment: V2OrderShipment | null;
  ordersDetails: readonly V2OrderItem[];
}

export interface V2OrderReadPage {
  orders: readonly V2Order[];
  pagination: V2OffsetPagination;
}
