import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import { getInventoryByBranch } from "../../services/inventoryService";
import type { ApiEnvelope, EntityId } from "../../types/http";

type RequestStatus = "idle" | "loading" | "succeeded" | "failed";

interface InventoryState {
  items: unknown[];
  status: RequestStatus;
  error: string | null;
  selectedBranchId: EntityId | null;
}

export const fetchInventoryByBranch = createAsyncThunk<
  unknown[],
  EntityId,
  { rejectValue: string }
>(
  "inventory/fetchByBranch",
  async (branchId, { rejectWithValue }) => {
    if (!branchId) {
      return rejectWithValue("Vui lòng chọn chi nhánh");
    }
    try {
      const response = await getInventoryByBranch(branchId);
      console.log("response inventory by branch", response.data.DT);
      if (response?.data && +response.data.EC === 0) {
        return response.data.DT || [];
      }

      return rejectWithValue(
        response?.data?.EM || "Không thể tải dữ liệu tồn kho"
      );
    } catch (error: unknown) {
      const message = isAxiosError<ApiEnvelope<unknown>>(error)
        ? error.response?.data?.EM
        : undefined;
      return rejectWithValue(message || "Không thể kết nối đến máy chủ");
    }
  }
);

const initialState: InventoryState = {
  items: [],
  status: "idle",
  error: null,
  selectedBranchId: null,
};

const inventorySlice = createSlice({
  name: "inventory",
  initialState,
  reducers: {
    setSelectedBranchId: (state, action: PayloadAction<EntityId | null>) => {
      state.selectedBranchId = action.payload;
    },
    clearInventoryState: (state) => {
      state.items = [];
      state.status = "idle";
      state.error = null;
      state.selectedBranchId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInventoryByBranch.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.items = [];
      })
      .addCase(fetchInventoryByBranch.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload || [];
      })
      .addCase(fetchInventoryByBranch.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Không thể tải dữ liệu tồn kho";
      });
  },
});

export const { setSelectedBranchId, clearInventoryState } =
  inventorySlice.actions;

export default inventorySlice.reducer;
