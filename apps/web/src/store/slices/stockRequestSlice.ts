import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import {
  approveStockRequest,
  createStockRequest,
  deleteStockRequest,
  getMyStockRequests,
  getPendingStockRequests,
  rejectStockRequest,
  updateStockRequestInfo,
} from "../../services/stockRequestService";
import type {
  CreateStockRequestInput,
  StockRequestDto,
  UpdateStockRequestInput,
} from "../../types/inventory";

interface StockRequestState {
  requests: StockRequestDto[];
  loading: boolean;
  error: string | null;
  selectedRequest: StockRequestDto | null;
}

interface UpdateStockRequestCommand {
  id: number;
  data: UpdateStockRequestInput;
}

interface RejectStockRequestCommand {
  id: number;
  note: string;
}

export const fetchMyStockRequests = createAsyncThunk<
  StockRequestDto[],
  number,
  { rejectValue: string }
>("stockRequest/fetchMy", async (branchId, { rejectWithValue }) => {
  try {
    const response = await getMyStockRequests(branchId);
    return Number(response.data.EC) === 0
      ? response.data.DT
      : rejectWithValue(response.data.EM);
  } catch {
    return rejectWithValue("Không thể tải danh sách yêu cầu");
  }
});

export const createStockRequestThunk = createAsyncThunk<
  StockRequestDto,
  CreateStockRequestInput,
  { rejectValue: string }
>("stockRequest/create", async (data, { rejectWithValue }) => {
  try {
    const response = await createStockRequest(data);
    if (Number(response.data.EC) === 0) {
      toast.success(response.data.EM || "Tạo yêu cầu thành công");
      return response.data.DT;
    }
    toast.error(response.data.EM);
    return rejectWithValue(response.data.EM);
  } catch {
    toast.error("Lỗi khi tạo yêu cầu");
    return rejectWithValue("Lỗi khi tạo yêu cầu");
  }
});

export const updateStockRequestInfoThunk = createAsyncThunk<
  void,
  UpdateStockRequestCommand,
  { rejectValue: string }
>("stockRequest/updateInfo", async ({ id, data }, { rejectWithValue }) => {
  try {
    const response = await updateStockRequestInfo(id, data);
    if (Number(response.data.EC) === 0) {
      toast.success(response.data.EM || "Cập nhật thành công");
      return;
    }
    toast.error(response.data.EM);
    return rejectWithValue(response.data.EM);
  } catch {
    toast.error("Lỗi khi cập nhật");
    return rejectWithValue("Lỗi khi cập nhật");
  }
});

export const deleteStockRequestThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>("stockRequest/delete", async (id, { rejectWithValue }) => {
  try {
    const response = await deleteStockRequest(id);
    if (Number(response.data.EC) === 0) {
      toast.success(response.data.EM || "Xóa thành công");
      return id;
    }
    toast.error(response.data.EM);
    return rejectWithValue(response.data.EM);
  } catch {
    toast.error("Lỗi khi xóa");
    return rejectWithValue("Lỗi khi xóa");
  }
});

export const fetchPendingStockRequests = createAsyncThunk<
  StockRequestDto[],
  void,
  { rejectValue: string }
>("stockRequest/fetchPending", async (_, { rejectWithValue }) => {
  try {
    const response = await getPendingStockRequests();
    return Number(response.data.EC) === 0
      ? response.data.DT
      : rejectWithValue(response.data.EM);
  } catch {
    return rejectWithValue("Không thể tải danh sách pending");
  }
});

export const approveStockRequestThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>("stockRequest/approve", async (id, { rejectWithValue }) => {
  try {
    const response = await approveStockRequest(id);
    if (Number(response.data.EC) === 0) {
      toast.success("Đã duyệt yêu cầu");
      return id;
    }
    toast.error(response.data.EM);
    return rejectWithValue(response.data.EM);
  } catch {
    toast.error("Lỗi khi duyệt");
    return rejectWithValue("Lỗi khi duyệt");
  }
});

export const rejectStockRequestThunk = createAsyncThunk<
  number,
  RejectStockRequestCommand,
  { rejectValue: string }
>("stockRequest/reject", async ({ id, note }, { rejectWithValue }) => {
  try {
    const response = await rejectStockRequest(id, note);
    if (Number(response.data.EC) === 0) {
      toast.success("Đã từ chối yêu cầu");
      return id;
    }
    toast.error(response.data.EM);
    return rejectWithValue(response.data.EM);
  } catch {
    toast.error("Lỗi khi từ chối");
    return rejectWithValue("Lỗi khi từ chối");
  }
});

const initialState: StockRequestState = {
  requests: [],
  loading: false,
  error: null,
  selectedRequest: null,
};

const stockRequestSlice = createSlice({
  name: "stockRequest",
  initialState,
  reducers: {
    setSelectedRequest: (state, action: PayloadAction<StockRequestDto>) => {
      state.selectedRequest = action.payload;
    },
    clearSelectedRequest: (state) => {
      state.selectedRequest = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyStockRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyStockRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload;
      })
      .addCase(fetchMyStockRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Không thể tải danh sách yêu cầu";
      })
      .addCase(fetchPendingStockRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPendingStockRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload;
      })
      .addCase(fetchPendingStockRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Không thể tải danh sách pending";
      })
      .addCase(createStockRequestThunk.fulfilled, (state, action) => {
        state.requests.unshift(action.payload);
      })
      .addCase(deleteStockRequestThunk.fulfilled, (state, action) => {
        state.requests = state.requests.filter((request) => request.id !== action.payload);
      })
      .addCase(approveStockRequestThunk.fulfilled, (state, action) => {
        state.requests = state.requests.filter((request) => request.id !== action.payload);
      })
      .addCase(rejectStockRequestThunk.fulfilled, (state, action) => {
        state.requests = state.requests.filter((request) => request.id !== action.payload);
      });
  },
});

export const { setSelectedRequest, clearSelectedRequest } = stockRequestSlice.actions;
export default stockRequestSlice.reducer;
