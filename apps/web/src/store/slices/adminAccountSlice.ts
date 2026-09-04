import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import {
  getAdminAccounts,
  createAdminAccount,
  updateAdminAccount,
  deleteAdminAccount,
} from "../../services/adminService";
import type { AdminAccountDto, AdminAccountInput } from "../../types/auth";
import type { ApiEnvelope } from "../../types/http";

interface AdminAccountState {
  list: AdminAccountDto[];
  loading: boolean;
  saving: boolean;
  deletingId: number | null;
  error: string | null;
}

interface UpdateAdminAccountInput {
  id: number;
  data: AdminAccountInput;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError<ApiEnvelope<unknown>>(error)) return fallback;
  return error.response?.data?.EM || fallback;
};

const initialState: AdminAccountState = {
  list: [],
  loading: false,
  saving: false,
  deletingId: null,
  error: null,
};

export const fetchAdminAccounts = createAsyncThunk<
  AdminAccountDto[],
  void,
  { rejectValue: string }
>(
  "adminAccounts/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const res = await getAdminAccounts();
      if (+res.data.EC === 0) {
        return res.data.DT || [];
      }
      const message = res.data.EM || "Không thể tải danh sách admin";
      return rejectWithValue(message);
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Không thể tải danh sách admin"));
    }
  }
);

export const createAdminAccountThunk = createAsyncThunk<
  AdminAccountDto,
  AdminAccountInput,
  { rejectValue: string }
>(
  "adminAccounts/create",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await createAdminAccount(payload);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Tạo admin mới thành công");
        return res.data.DT;
      }
      const message = res.data.EM || "Tạo admin mới thất bại";
      toast.error(message);
      return rejectWithValue(message);
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "Không thể tạo tài khoản admin");
      toast.error(message);
      return rejectWithValue(message);
    }
  }
);

export const updateAdminAccountThunk = createAsyncThunk<
  AdminAccountDto,
  UpdateAdminAccountInput,
  { rejectValue: string }
>(
  "adminAccounts/update",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await updateAdminAccount(id, data);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Cập nhật admin thành công");
        return res.data.DT;
      }
      const message = res.data.EM || "Cập nhật admin thất bại";
      toast.error(message);
      return rejectWithValue(message);
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "Không thể cập nhật tài khoản admin");
      toast.error(message);
      return rejectWithValue(message);
    }
  }
);

export const deleteAdminAccountThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>(
  "adminAccounts/delete",
  async (id, { rejectWithValue }) => {
    try {
      const res = await deleteAdminAccount(id);
      if (+res.data.EC === 0) {
        toast.success(res.data.EM || "Xóa admin thành công");
        return id;
      }
      const message = res.data.EM || "Xóa admin thất bại";
      toast.error(message);
      return rejectWithValue(message);
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "Không thể xóa tài khoản admin");
      toast.error(message);
      return rejectWithValue(message);
    }
  }
);

const adminAccountSlice = createSlice({
  name: "adminAccounts",
  initialState,
  reducers: {
    resetAdminAccountError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetch
      .addCase(fetchAdminAccounts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminAccounts.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchAdminAccounts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Không thể tải danh sách admin";
      })
      // create
      .addCase(createAdminAccountThunk.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(createAdminAccountThunk.fulfilled, (state, action) => {
        state.saving = false;
        if (action.payload) {
          state.list.unshift(action.payload);
        }
      })
      .addCase(createAdminAccountThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? "Không thể tạo tài khoản admin";
      })
      // update
      .addCase(updateAdminAccountThunk.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(updateAdminAccountThunk.fulfilled, (state, action) => {
        state.saving = false;
        const updated = action.payload;
        if (!updated) return;
        state.list = state.list.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        );
      })
      .addCase(updateAdminAccountThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? "Không thể cập nhật tài khoản admin";
      })
      // delete
      .addCase(deleteAdminAccountThunk.pending, (state, action) => {
        state.deletingId = action.meta.arg;
        state.error = null;
      })
      .addCase(deleteAdminAccountThunk.fulfilled, (state, action) => {
        state.list = state.list.filter((item) => item.id !== action.payload);
        state.deletingId = null;
      })
      .addCase(deleteAdminAccountThunk.rejected, (state, action) => {
        state.deletingId = null;
        state.error = action.payload ?? "Không thể xóa tài khoản admin";
      });
  },
});

export const { resetAdminAccountError } = adminAccountSlice.actions;
export default adminAccountSlice.reducer;
