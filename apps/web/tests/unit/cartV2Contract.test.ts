import { describe, expect, it } from "vitest";
import { parseV2CartReadResponse } from "../../src/services/cart-v2.contract";

describe("cart V2 response contract", () => {
  it("keeps cart IDs and product money as exact strings", () => {
    const cart = parseV2CartReadResponse({
      EM: "Get cart successfully",
      EC: 0,
      DT: [{
        id: "9007199254740993",
        productId: "9007199254740992",
        productVariantId: "9007199254740991",
        name: "Áo khoác",
        price: "129000.0000",
        images: [{ url: "https://cdn.example.test/products/jacket.jpg" }],
        size: "L",
        quantity: 2,
        catalogActive: true,
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });

    expect(cart).toMatchObject({
      items: [{
        id: "9007199254740993",
        productId: "9007199254740992",
        productVariantId: "9007199254740991",
        price: "129000.0000",
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
  });

  it("accepts an empty reusable cart with zero pages", () => {
    expect(parseV2CartReadResponse({
      EM: "Get cart successfully",
      EC: 0,
      DT: [],
      pagination: { page: 1, limit: 100, totalItems: 0, totalPages: 0 },
    })).toMatchObject({ items: [], pagination: { totalItems: 0, totalPages: 0 } });
  });

  it("rejects a lossy item identifier", () => {
    expect(parseV2CartReadResponse({
      EM: "Get cart successfully",
      EC: 0,
      DT: [{
        id: 7,
        productId: "8",
        productVariantId: "9",
        name: "Áo khoác",
        price: "129000.0000",
        images: [],
        size: "L",
        quantity: 1,
        catalogActive: true,
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    })).toBeNull();
  });

  it("rejects a non-success response envelope before reading its payload", () => {
    expect(parseV2CartReadResponse({
      EM: "Customer identity required",
      EC: 3,
      DT: [],
      pagination: { page: 1, limit: 100, totalItems: 0, totalPages: 0 },
    })).toBeNull();
  });

  it("rejects unsafe media even when the remaining item fields are valid", () => {
    expect(parseV2CartReadResponse({
      EM: "Get cart successfully",
      EC: 0,
      DT: [{
        id: "7",
        productId: "8",
        productVariantId: "9",
        name: "Áo khoác",
        price: "129000.0000",
        images: [{ url: "javascript:alert(1)" }],
        size: "L",
        quantity: 1,
        catalogActive: true,
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    })).toBeNull();
  });

  it("rejects non-canonical money and impossible pagination metadata", () => {
    expect(parseV2CartReadResponse({
      EM: "Get cart successfully",
      EC: 0,
      DT: [{
        id: "7",
        productId: "8",
        productVariantId: "9",
        name: "Áo khoác",
        price: "129000",
        images: [],
        size: "L",
        quantity: 1,
        catalogActive: true,
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    })).toBeNull();

    expect(parseV2CartReadResponse({
      EM: "Get cart successfully",
      EC: 0,
      DT: [{
        id: "7",
        productId: "8",
        productVariantId: "9",
        name: "Áo khoác",
        price: "129000.0000",
        images: [],
        size: "L",
        quantity: 1,
        catalogActive: true,
      }],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    })).toBeNull();
  });
});
