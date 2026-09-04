import { describe, expect, it } from "vitest";
import reducer, { addToCartAsync } from "../../src/store/slices/cartSlice";

describe("cart state", () => {
  it("replaces state from the authoritative mutation result without double-counting", () => {
    const item = {
      id: "local-1",
      productId: 1,
      sizeId: 2,
      quantity: 1,
      price: 100,
      images: "not-json.jpg",
    };

    const state = reducer(
      undefined,
      addToCartAsync.fulfilled([item], "request-id", item),
    );

    expect(state.cartItems).toHaveLength(1);
    expect(state.cartItems[0].images).toEqual(["not-json.jpg"]);
    expect(state.totalQuantity).toBe(1);
    expect(state.totalPrice).toBe(100);
  });
});
