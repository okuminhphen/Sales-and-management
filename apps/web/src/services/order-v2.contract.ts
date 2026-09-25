import { parseV2CatalogImage } from "./catalog-v2.contract";
import { parseV2EntityId, parseV2Money, parseV2OffsetPagination } from "./database-v2.contract";
import type { V2CatalogImage } from "../types/catalog-v2";
import type {
  V2FulfillmentStatus,
  V2FulfillmentType,
  V2Order,
  V2OrderChannel,
  V2OrderItem,
  V2OrderReadPage,
  V2OrderShipment,
  V2OrderStatus,
  V2ShipmentStatus,
} from "../types/order-v2";

type UnknownRecord = Record<string, unknown>;

const MAX_ORDER_ITEMS = 100;
const MAX_QUANTITY = 2_147_483_647;
const INTERNAL_IMAGE_ORIGIN = "https://order-image.invalid";

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseText = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value : null;

const parseNullableText = (value: unknown, maximum: number): string | null | undefined =>
  value === null ? null : parseText(value, maximum) ?? undefined;

const parseNullableEmail = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  const email = parseText(value, 255);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
};

const parseNullableEntityId = (value: unknown) =>
  value === null ? null : parseV2EntityId(value) ?? undefined;

const parseUtcTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length !== 24) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null;
};

const parseNullableUtcTimestamp = (value: unknown): string | null | undefined =>
  value === null ? null : parseUtcTimestamp(value) ?? undefined;

const parseQuantity = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_QUANTITY
    ? value
    : null;

const parseOrderImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000 || /[\u0000-\u001F]/.test(value)) {
    return null;
  }
  try {
    if (value.startsWith("/")) {
      const target = new URL(value, INTERNAL_IMAGE_ORIGIN);
      return target.origin === INTERNAL_IMAGE_ORIGIN ? value : null;
    }
    const target = new URL(value);
    return target.protocol === "http:" || target.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

const parseOrderImage = (value: unknown): V2CatalogImage | null => {
  const catalogImage = parseV2CatalogImage(value);
  if (catalogImage) return catalogImage;
  const url = parseOrderImageUrl(value);
  return url ? { url } : null;
};

const parseNullableOrderImages = (value: unknown): readonly V2CatalogImage[] | null | undefined => {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > 5) return undefined;
  const images = value.map(parseOrderImage);
  return images.every((image): image is V2CatalogImage => image !== null) ? images : undefined;
};

const parseOrderStatus = (value: unknown): V2OrderStatus | null =>
  value === "PENDING" || value === "CONFIRMED" || value === "COMPLETED" || value === "CANCELLED" ? value : null;

const parseOrderChannel = (value: unknown): V2OrderChannel | null =>
  value === "online" || value === "in_store" ? value : null;

const parseFulfillmentType = (value: unknown): V2FulfillmentType | null =>
  value === "delivery" || value === "store_pickup" || value === "carry_out" ? value : null;

const parseFulfillmentStatus = (value: unknown): V2FulfillmentStatus | null =>
  value === "unfulfilled" || value === "preparing" || value === "ready_for_pickup" || value === "shipping" ||
  value === "fulfilled" || value === "exception" || value === "cancelled" ? value : null;

const parseShipmentStatus = (value: unknown): V2ShipmentStatus | null =>
  value === "pending" || value === "booked" || value === "shipping" || value === "delivered" ||
  value === "failed" || value === "returning" || value === "returned" || value === "cancelled" ? value : null;

const moneyToMinorUnits = (value: string): bigint => BigInt(value.replace(".", ""));

const parseOrderItem = (value: unknown, orderId: string): V2OrderItem | null => {
  if (!isRecord(value)) return null;
  const id = parseV2EntityId(value.id);
  const itemOrderId = parseV2EntityId(value.orderId);
  const productId = parseNullableEntityId(value.productId);
  const skuSnapshot = parseText(value.skuSnapshot, 100);
  const productName = parseText(value.productName, 255);
  const productSize = parseText(value.productSize, 100);
  const productImage = parseNullableOrderImages(value.productImage);
  const quantity = parseQuantity(value.quantity);
  const priceAtOrder = parseV2Money(value.priceAtOrder);
  const discountAmount = parseV2Money(value.discountAmount);
  const totalPrice = parseV2Money(value.totalPrice);
  if (!id || !itemOrderId || itemOrderId !== orderId || productId === undefined || !skuSnapshot || !productName ||
      !productSize || productImage === undefined || !quantity || !priceAtOrder || !discountAmount || !totalPrice) return null;

  const gross = moneyToMinorUnits(priceAtOrder) * BigInt(quantity);
  const discount = moneyToMinorUnits(discountAmount);
  if (discount > gross || gross - discount !== moneyToMinorUnits(totalPrice)) return null;
  return { id, orderId: itemOrderId, productId, skuSnapshot, productName, productSize, productImage,
    quantity, priceAtOrder, discountAmount, totalPrice };
};

const parseShipment = (value: unknown): V2OrderShipment | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const id = parseV2EntityId(value.id);
  const provider = parseText(value.provider, 50);
  const status = parseShipmentStatus(value.status);
  const trackingNumber = parseNullableText(value.trackingNumber, 191);
  const codAmount = parseV2Money(value.codAmount);
  const shippedAt = parseNullableUtcTimestamp(value.shippedAt);
  const deliveredAt = parseNullableUtcTimestamp(value.deliveredAt);
  const returnedAt = parseNullableUtcTimestamp(value.returnedAt);
  if (!id || !provider || !status || trackingNumber === undefined || !codAmount || shippedAt === undefined ||
      deliveredAt === undefined || returnedAt === undefined || (status === "delivered" && deliveredAt === null)) return undefined;
  return { id, provider, status, trackingNumber, codAmount, shippedAt, deliveredAt, returnedAt };
};

const parseOrder = (value: unknown): V2Order | null => {
  if (!isRecord(value)) return null;
  const id = parseV2EntityId(value.id);
  const code = parseText(value.code, 50);
  const customerId = parseNullableEntityId(value.customerId);
  const branchId = parseV2EntityId(value.branchId);
  const channel = parseOrderChannel(value.channel);
  const fulfillmentType = parseFulfillmentType(value.fulfillmentType);
  const fulfillmentStatus = parseFulfillmentStatus(value.fulfillmentStatus);
  const orderDate = parseUtcTimestamp(value.orderDate);
  const totalPrice = parseV2Money(value.totalPrice);
  const subtotalAmount = parseV2Money(value.subtotalAmount);
  const discountAmount = parseV2Money(value.discountAmount);
  const shippingFee = parseV2Money(value.shippingFee);
  const status = parseOrderStatus(value.status);
  const customerName = parseNullableText(value.customerName, 255);
  const customerEmail = parseNullableEmail(value.customerEmail);
  const customerPhone = parseNullableText(value.customerPhone, 30);
  const shipment = parseShipment(value.shipment);
  if (!id || !code || customerId === undefined || !branchId || !channel || !fulfillmentType || !fulfillmentStatus ||
      !orderDate || !totalPrice || !subtotalAmount || !discountAmount || !shippingFee || !status ||
      customerName === undefined || customerEmail === undefined || customerPhone === undefined || shipment === undefined || !Array.isArray(value.ordersDetails) ||
      value.ordersDetails.length === 0 || value.ordersDetails.length > MAX_ORDER_ITEMS) return null;
  if ((channel === "online" && customerId === null) || (fulfillmentType === "carry_out" && channel !== "in_store") ||
      (fulfillmentType !== "delivery" && moneyToMinorUnits(shippingFee) !== 0n) ||
      (fulfillmentType !== "delivery" && shipment !== null) ||
      (shipment !== null && moneyToMinorUnits(shipment.codAmount) > moneyToMinorUnits(totalPrice)) ||
      (status === "COMPLETED" && fulfillmentStatus !== "fulfilled")) return null;

  const details = value.ordersDetails.map((item) => parseOrderItem(item, id));
  if (!details.every((item): item is V2OrderItem => item !== null)) return null;
  const subtotal = moneyToMinorUnits(subtotalAmount);
  const discount = moneyToMinorUnits(discountAmount);
  const shipping = moneyToMinorUnits(shippingFee);
  const itemSubtotal = details.reduce((sum, item) => sum + moneyToMinorUnits(item.priceAtOrder) * BigInt(item.quantity), 0n);
  const itemDiscount = details.reduce((sum, item) => sum + moneyToMinorUnits(item.discountAmount), 0n);
  const itemTotal = details.reduce((sum, item) => sum + moneyToMinorUnits(item.totalPrice), 0n);
  if (discount > subtotal || itemSubtotal !== subtotal || itemDiscount !== discount ||
      itemTotal + shipping !== moneyToMinorUnits(totalPrice) || subtotal - discount + shipping !== moneyToMinorUnits(totalPrice)) return null;
  return { id, code, customerId, branchId, channel, fulfillmentType, fulfillmentStatus, orderDate,
    totalPrice, subtotalAmount, discountAmount, shippingFee, status, customerName, customerEmail,
    customerPhone, shipment, ordersDetails: details };
};

const parseSuccessfulData = (value: unknown): unknown | null =>
  isRecord(value) && value.EC === 0 ? value.DT : null;

/** Validates a visible V2 order detail before it can reach Web state or a view. */
export const parseV2OrderDetailResponse = (value: unknown): V2Order | null =>
  parseOrder(parseSuccessfulData(value));

/** Validates a paginated own/branch/admin V2 order read response before Web consumption. */
export const parseV2OrderListResponse = (value: unknown): V2OrderReadPage | null => {
  const data = parseSuccessfulData(value);
  if (!Array.isArray(data) || !isRecord(value)) return null;
  const orders = data.map(parseOrder);
  if (!orders.every((order): order is V2Order => order !== null)) return null;
  const pagination = parseV2OffsetPagination(value.pagination, orders.length);
  return pagination ? { orders, pagination } : null;
};
