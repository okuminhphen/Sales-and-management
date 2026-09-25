import { describe, expect, it } from "vitest";
import { parseV2OrderDetailResponse, parseV2OrderListResponse } from "../../src/services/order-v2.contract";

const order = {
  id: "9007199254740993",
  code: "ORD-9007199254740993",
  customerId: "9007199254740992",
  branchId: "9007199254740991",
  channel: "online",
  fulfillmentType: "delivery",
  fulfillmentStatus: "shipping",
  orderDate: "2026-09-26T00:00:00.000Z",
  totalPrice: "110000.0000",
  subtotalAmount: "120000.0000",
  discountAmount: "20000.0000",
  shippingFee: "10000.0000",
  status: "CONFIRMED",
  customerName: "Nguyen A",
  customerEmail: null,
  customerPhone: null,
  shipment: {
    id: "9007199254740990",
    provider: "GHN",
    status: "shipping",
    trackingNumber: "TRACK-123",
    codAmount: "110000.0000",
    shippedAt: "2026-09-26T01:00:00.000Z",
    deliveredAt: null,
    returnedAt: null,
  },
  ordersDetails: [{
    id: "12",
    orderId: "9007199254740993",
    productId: "11",
    skuSnapshot: "SKU-1",
    productName: "Áo khoác",
    productSize: "L",
    productImage: [{ url: "https://cdn.example.test/products/jacket.jpg" }],
    quantity: 2,
    priceAtOrder: "60000.0000",
    discountAmount: "20000.0000",
    totalPrice: "100000.0000",
  }],
};

describe("order V2 response contract", () => {
  it("keeps IDs, money and item snapshots as exact safe values", () => {
    const page = parseV2OrderListResponse({
      EM: "Get orders successfully",
      EC: 0,
      DT: [order],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });

    expect(page).toMatchObject({
      orders: [{
        id: "9007199254740993",
        totalPrice: "110000.0000",
        ordersDetails: [{
          orderId: "9007199254740993",
          productId: "11",
          priceAtOrder: "60000.0000",
          productImage: [{ url: "https://cdn.example.test/products/jacket.jpg" }],
        }],
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
  });

  it("normalizes a safe internal image path from an immutable order snapshot", () => {
    const detail = parseV2OrderDetailResponse({
      EM: "Get order successfully",
      EC: 0,
      DT: {
        ...order,
        fulfillmentType: "store_pickup",
        shipment: null,
        shippingFee: "0.0000",
        totalPrice: "100000.0000",
        ordersDetails: [{
          ...order.ordersDetails[0],
          productImage: ["/uploads/orders/jacket.jpg"],
        }],
      },
    });

    expect(detail?.ordersDetails[0]?.productImage).toEqual([{ url: "/uploads/orders/jacket.jpg" }]);
  });

  it("rejects an unsafe snapshot image and inconsistent money invariants", () => {
    expect(parseV2OrderDetailResponse({
      EM: "Get order successfully",
      EC: 0,
      DT: {
        ...order,
        ordersDetails: [{
          ...order.ordersDetails[0],
          productImage: ["javascript:alert(1)"],
        }],
      },
    })).toBeNull();

    expect(parseV2OrderDetailResponse({
      EM: "Get order successfully",
      EC: 0,
      DT: { ...order, totalPrice: "100000.0000" },
    })).toBeNull();

    expect(parseV2OrderDetailResponse({
      EM: "Get order successfully",
      EC: 0,
      DT: {
        ...order,
        shipment: { ...order.shipment, codAmount: "1100000.0000" },
      },
    })).toBeNull();
  });

  it("rejects a non-success envelope and impossible list pagination", () => {
    expect(parseV2OrderDetailResponse({ EM: "Order access denied", EC: 3, DT: null })).toBeNull();

    expect(parseV2OrderListResponse({
      EM: "Get orders successfully",
      EC: 0,
      DT: [order],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    })).toBeNull();
  });
});
