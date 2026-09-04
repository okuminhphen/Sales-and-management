import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import {
  createOrder,
  createOrderAtBranch,
  deleteOrder,
  fetchAllOrders,
  fetchOrdersByBranch,
  getOrdersByUserId,
  updateOrderStatus,
} from "../../services/orderService";
import type { UserSession } from "../../types/auth";
import type { ApiEnvelope, EntityId } from "../../types/http";
import type {
  CreatedOrderDto,
  CreateOrderInput,
  FetchOrdersInput,
  OrderDto,
  UpdateOrderStatusInput,
} from "../../types/order";

interface OrderState {
  orders: OrderDto[];
  tempOrder: ApiEnvelope<CreatedOrderDto> | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

interface OrderThunkState {
  user: { currentUser: UserSession | null };
}

interface OrderThunkConfig {
  state: OrderThunkState;
  rejectValue: string;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError<ApiEnvelope<unknown>>(error)) return fallback;
  return error.response?.data?.EM || fallback;
};

export const fetchOrdersThunk = createAsyncThunk<
  OrderDto[],
  FetchOrdersInput,
  OrderThunkConfig
>("order/fetchOrders", async ({ role, branchId }, { rejectWithValue }) => {
  try {
    if (role !== "SUPER_ADMIN" && role !== "BRANCH_MANAGER") {
      return rejectWithValue("Role không hợp lệ!");
    }
    if (role === "BRANCH_MANAGER" && !branchId) {
      return rejectWithValue("Không xác định được chi nhánh!");
    }

    const response =
      role === "SUPER_ADMIN"
        ? await fetchAllOrders()
        : await fetchOrdersByBranch(branchId as number);
    if (Number(response.data.EC) !== 0) {
      return rejectWithValue(response.data.EM);
    }
    return response.data.DT;
  } catch (error) {
    return rejectWithValue(apiErrorMessage(error, "Lỗi khi lấy đơn hàng!"));
  }
});

export const updateAdminOrderStatusThunk = createAsyncThunk<
  OrderDto,
  UpdateOrderStatusInput,
  OrderThunkConfig
>(
  "order/updateAdminOrderStatus",
  async ({ orderId, updatedData }, { rejectWithValue }) => {
    try {
      const response = await updateOrderStatus(orderId, updatedData);
      if (Number(response.data.EC) !== 0) {
        return rejectWithValue(response.data.EM || "Không thể cập nhật đơn hàng!");
      }
      return response.data.DT;
    } catch (error) {
      return rejectWithValue(
        apiErrorMessage(error, "Lỗi khi cập nhật đơn hàng!"),
      );
    }
  },
);

export const deleteAdminOrderThunk = createAsyncThunk<
  EntityId,
  EntityId,
  OrderThunkConfig
>("order/deleteAdminOrder", async (orderId, { rejectWithValue }) => {
  try {
    const response = await deleteOrder(orderId);
    if (Number(response.data.EC) !== 0) {
      return rejectWithValue(response.data.EM || "Không thể xóa đơn hàng!");
    }
    return orderId;
  } catch (error) {
    return rejectWithValue(apiErrorMessage(error, "Lỗi khi xóa đơn hàng!"));
  }
});

export const fetchOrdersUserThunk = createAsyncThunk<
  OrderDto[],
  void,
  OrderThunkConfig
>("order/fetchOrdersUser", async (_, { getState, rejectWithValue }) => {
  try {
    const userId = getState().user.currentUser?.userId;
    if (!userId) return rejectWithValue("Người dùng chưa đăng nhập!");
    const response = await getOrdersByUserId(userId);
    if (Number(response.data.EC) !== 0 || !Array.isArray(response.data.DT)) {
      return rejectWithValue(response.data.EM || "Dữ liệu đơn hàng không hợp lệ");
    }
    return response.data.DT;
  } catch (error) {
    return rejectWithValue(
      apiErrorMessage(error, "Lỗi khi lấy danh sách đơn hàng!"),
    );
  }
});

export const createOrderThunk = createAsyncThunk<
  ApiEnvelope<CreatedOrderDto>,
  CreateOrderInput,
  OrderThunkConfig
>("order/createOrder", async (orderData, { getState, rejectWithValue }) => {
  try {
    if (!getState().user.currentUser?.userId) {
      return rejectWithValue("Người dùng chưa đăng nhập!");
    }
    const response = await createOrder(orderData);
    if (Number(response.data.EC) !== 0) {
      return rejectWithValue(response.data.EM);
    }
    return response.data;
  } catch (error) {
    return rejectWithValue(apiErrorMessage(error, "Lỗi khi tạo đơn hàng!"));
  }
});

export const updateOrderStatusThunk = createAsyncThunk<
  OrderDto,
  UpdateOrderStatusInput,
  OrderThunkConfig
>(
  "order/updateOrderStatus",
  async ({ orderId, updatedData }, { rejectWithValue }) => {
    try {
      const response = await updateOrderStatus(orderId, updatedData);
      if (Number(response.data.EC) !== 0) {
        return rejectWithValue(response.data.EM || "Không thể cập nhật đơn hàng!");
      }
      return response.data.DT;
    } catch (error) {
      return rejectWithValue(
        apiErrorMessage(error, "Lỗi khi cập nhật đơn hàng!"),
      );
    }
  },
);

export const createOrderAtBranchThunk = createAsyncThunk<
  OrderDto,
  CreateOrderInput,
  OrderThunkConfig
>("order/createOrderAtBranch", async (orderData, { rejectWithValue }) => {
  try {
    const response = await createOrderAtBranch(orderData);
    if (Number(response.data.EC) !== 0) {
      return rejectWithValue(response.data.EM);
    }
    return response.data.DT;
  } catch (error) {
    return rejectWithValue(apiErrorMessage(error, "Lỗi khi tạo đơn hàng!"));
  }
});

const initialState: OrderState = {
  orders: [],
  tempOrder: null,
  status: "idle",
  error: null,
};

const upsertOrder = (state: OrderState, updatedOrder: OrderDto): void => {
  const index = state.orders.findIndex((order) => order.id === updatedOrder.id);
  if (index === -1) state.orders.push(updatedOrder);
  else state.orders[index] = updatedOrder;
};

const orderSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    addOrderTemp: (
      state,
      action: PayloadAction<ApiEnvelope<CreatedOrderDto> | null>,
    ) => {
      state.tempOrder = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrdersThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchOrdersThunk.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.orders = action.payload;
      })
      .addCase(fetchOrdersThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Lỗi khi lấy đơn hàng";
      })
      .addCase(fetchOrdersUserThunk.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchOrdersUserThunk.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.orders = action.payload;
      })
      .addCase(fetchOrdersUserThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Lỗi khi lấy đơn hàng";
      })
      .addCase(createOrderThunk.fulfilled, (state, action) => {
        state.tempOrder = action.payload;
        state.error = null;
      })
      .addCase(createOrderAtBranchThunk.fulfilled, (state, action) => {
        upsertOrder(state, action.payload);
        state.error = null;
      })
      .addCase(updateOrderStatusThunk.fulfilled, (state, action) => {
        upsertOrder(state, action.payload);
        state.error = null;
      })
      .addCase(updateAdminOrderStatusThunk.fulfilled, (state, action) => {
        upsertOrder(state, action.payload);
        state.error = null;
      })
      .addCase(deleteAdminOrderThunk.fulfilled, (state, action) => {
        state.orders = state.orders.filter(
          (order) => String(order.id) !== String(action.payload),
        );
        state.error = null;
      })
      .addMatcher(
        (action): action is { type: string; payload?: string } =>
          action.type.startsWith("order/") && action.type.endsWith("/rejected"),
        (state, action) => {
          state.error = action.payload ?? "Thao tác đơn hàng thất bại";
        },
      );
  },
});

export const { addOrderTemp } = orderSlice.actions;
export default orderSlice.reducer;
