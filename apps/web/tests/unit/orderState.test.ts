import { describe, expect, it } from "vitest";
import reducer, {
  createOrderThunk,
  updateOrderStatusThunk,
} from "../../src/store/slices/orderSlice";

describe("order state", () => {
  it("stores the create receipt separately instead of treating it as an order", () => {
    const receipt = {
      EC: "0",
      EM: "created",
      DT: { orderId: 9, code: "ORD-000009" },
    };

    const state = reducer(
      undefined,
      createOrderThunk.fulfilled(receipt, "request-id", {}),
    );

    expect(state.orders).toEqual([]);
    expect(state.tempOrder).toEqual(receipt);
  });

  it("upserts the complete order returned by a status change", () => {
    const order = { id: 9, status: "CANCELLED" as const, totalPrice: 100 };
    const state = reducer(
      undefined,
      updateOrderStatusThunk.fulfilled(order, "request-id", {
        orderId: 9,
        updatedData: { status: "CANCELLED" },
      }),
    );

    expect(state.orders).toEqual([order]);
  });
});
