import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addToLocalStorageCart,
  clearLocalStorageCart,
  getLocalStorageCart,
  removeFromLocalStorageCart,
  updateLocalStorageCartItem,
} from "../../src/utils/localStorageCart";

describe("guest cart", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Date, "now").mockReturnValue(1);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  it("adds and merges the same product and size", () => {
    addToLocalStorageCart({ productId: 1, sizeId: 2, quantity: 1 });
    const result = addToLocalStorageCart({ productId: 1, sizeId: 2, quantity: 2 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ quantity: 3, id: "local_1_0.5" });
  });

  it("updates, removes, and clears items", () => {
    const [item] = addToLocalStorageCart({ productId: 1, sizeId: 2, quantity: 1 });
    expect(updateLocalStorageCartItem(item.id, 4)[0].quantity).toBe(4);
    expect(removeFromLocalStorageCart(item.id)).toEqual([]);

    addToLocalStorageCart({ productId: 3, sizeId: 4, quantity: 1 });
    clearLocalStorageCart();
    expect(getLocalStorageCart()).toEqual([]);
  });
});
