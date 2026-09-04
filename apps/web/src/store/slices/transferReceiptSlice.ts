import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import {
  getAllTransferReceipts,
  getTransferReceiptDetail,
  approveTransferReceipt,
  rejectTransferReceipt,
  completeTransferReceipt,
  cancelTransferReceipt,
} from "../../services/transferReceiptService";
import { toast } from "react-toastify";
import type { TransferReceiptDto, TransferReceiptStatus } from "../../types/inventory";

interface TransferReceiptState {
  receipts: TransferReceiptDto[];
  selectedReceipt: TransferReceiptDto | null;
  loading: boolean;
  error: string | null;
}

interface RejectTransferInput {
  id: number;
  reason: string;
}

// Lấy danh sách tất cả phiếu chuyển kho
export const fetchTransferReceipts = createAsyncThunk<
  TransferReceiptDto[],
  void,
  { rejectValue: string }
>(
  "transferReceipt/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const res = await getAllTransferReceipts();
      if (+res.data.EC === 0) return res.data.DT;
      return rejectWithValue(res.data.EM);
    } catch (e) {
      console.log(e);
      return rejectWithValue("Không thể tải danh sách phiếu chuyển kho");
    }
  }
);

// Lấy chi tiết phiếu chuyển kho
export const fetchTransferReceiptDetail = createAsyncThunk<
  TransferReceiptDto,
  number,
  { rejectValue: string }
>(
  "transferReceipt/fetchDetail",
  async (id, { rejectWithValue }) => {
    try {
      const res = await getTransferReceiptDetail(id);
      if (+res.data.EC === 0) return res.data.DT;
      return rejectWithValue(res.data.EM);
    } catch (e) {
      console.log(e);
      return rejectWithValue("Không thể tải chi tiết phiếu chuyển kho");
    }
  }
);

// Duyệt phiếu chuyển kho
export const approveTransferReceiptThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>(
  "transferReceipt/approve",
  async (id, { rejectWithValue }) => {
    try {
      const res = await approveTransferReceipt(id);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Đã duyệt phiếu chuyển kho");
        return id;
      }
      toast.error(res.data.EM);
      return rejectWithValue(res.data.EM);
    } catch (e) {
      toast.error("Lỗi khi duyệt phiếu chuyển kho");
      return rejectWithValue("Lỗi khi duyệt phiếu chuyển kho");
    }
  }
);

// Từ chối phiếu chuyển kho
export const rejectTransferReceiptThunk = createAsyncThunk<
  number,
  RejectTransferInput,
  { rejectValue: string }
>(
  "transferReceipt/reject",
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const res = await rejectTransferReceipt(id, reason);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Đã từ chối phiếu chuyển kho");
        return id;
      }
      toast.error(res.data.EM);
      return rejectWithValue(res.data.EM);
    } catch (e) {
      toast.error("Lỗi khi từ chối phiếu chuyển kho");
      return rejectWithValue("Lỗi khi từ chối phiếu chuyển kho");
    }
  }
);

// Hoàn thành phiếu chuyển kho
export const completeTransferReceiptThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>(
  "transferReceipt/complete",
  async (id, { rejectWithValue }) => {
    try {
      const res = await completeTransferReceipt(id);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Đã hoàn thành phiếu chuyển kho");
        return id;
      }
      toast.error(res.data.EM);
      return rejectWithValue(res.data.EM);
    } catch (e) {
      toast.error("Lỗi khi hoàn thành phiếu chuyển kho");
      return rejectWithValue("Lỗi khi hoàn thành phiếu chuyển kho");
    }
  }
);

// Hủy phiếu chuyển kho
export const cancelTransferReceiptThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>(
  "transferReceipt/cancel",
  async (id, { rejectWithValue }) => {
    try {
      const res = await cancelTransferReceipt(id);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Đã hủy phiếu chuyển kho");
        return id;
      }
      toast.error(res.data.EM);
      return rejectWithValue(res.data.EM);
    } catch (e) {
      toast.error("Lỗi khi hủy phiếu chuyển kho");
      return rejectWithValue("Lỗi khi hủy phiếu chuyển kho");
    }
  }
);

const initialState: TransferReceiptState = {
  receipts: [],
  selectedReceipt: null,
  loading: false,
  error: null,
};

const transferReceiptSlice = createSlice({
  name: "transferReceipt",
  initialState,
  reducers: {
    setSelectedReceipt: (state, action: PayloadAction<TransferReceiptDto>) => {
      state.selectedReceipt = action.payload;
    },
    clearSelectedReceipt: (state) => {
      state.selectedReceipt = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchTransferReceipts.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTransferReceipts.fulfilled, (state, action) => {
        state.loading = false;
        state.receipts = action.payload || [];
      })
      .addCase(fetchTransferReceipts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Không thể tải danh sách phiếu chuyển kho";
      })
      // Fetch detail
      .addCase(fetchTransferReceiptDetail.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTransferReceiptDetail.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedReceipt = action.payload;
      })
      .addCase(fetchTransferReceiptDetail.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Không thể tải chi tiết phiếu chuyển kho";
      })
      // Approve
      .addCase(approveTransferReceiptThunk.fulfilled, (state, action) => {
        const id = action.payload;
        state.receipts = state.receipts.map((r) =>
          r.id === id ? { ...r, status: "approved" } : r
        );
        if (state.selectedReceipt?.id === id) {
          state.selectedReceipt = {
            ...state.selectedReceipt,
            status: "approved",
          };
        }
      })
      // Reject
      .addCase(rejectTransferReceiptThunk.fulfilled, (state, action) => {
        const id = action.payload;
        state.receipts = state.receipts.map((r) =>
          r.id === id ? { ...r, status: "rejected" } : r
        );
        if (state.selectedReceipt?.id === id) {
          state.selectedReceipt = {
            ...state.selectedReceipt,
            status: "rejected",
          };
        }
      })
      // Complete
      .addCase(completeTransferReceiptThunk.fulfilled, (state, action) => {
        const id = action.payload;
        state.receipts = state.receipts.map((r) =>
          r.id === id ? { ...r, status: "completed" } : r
        );
        if (state.selectedReceipt?.id === id) {
          state.selectedReceipt = {
            ...state.selectedReceipt,
            status: "completed",
          };
        }
      })
      // Cancel
      .addCase(cancelTransferReceiptThunk.fulfilled, (state, action) => {
        const id = action.payload;
        state.receipts = state.receipts.map((r) =>
          r.id === id ? { ...r, status: "cancelled" } : r
        );
        if (state.selectedReceipt?.id === id) {
          state.selectedReceipt = {
            ...state.selectedReceipt,
            status: "cancelled",
          };
        }
      });
  },
});

export const { setSelectedReceipt, clearSelectedReceipt } =
  transferReceiptSlice.actions;

export default transferReceiptSlice.reducer;
