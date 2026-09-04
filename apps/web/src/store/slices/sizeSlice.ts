import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import {
  fetchSizes as fetchSizesApi,
  createSize as createSizeApi,
  updateSize as updateSizeApi,
  deleteSize as deleteSizeApi,
} from "../../services/sizeService";
import type { CreateSizeInput, SizeDto, UpdateSizeInput } from "../../types/catalog";
import type { ApiEnvelope } from "../../types/http";

type RequestStatus = "idle" | "loading" | "succeeded" | "failed";

interface SizeState {
  sizes: SizeDto[];
  status: RequestStatus;
  error: string | null;
  mutationStatus: RequestStatus;
  mutationError: string | null;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError<ApiEnvelope<unknown>>(error)) return fallback;
  return error.response?.data?.EM || fallback;
};

export const fetchSizes = createAsyncThunk<SizeDto[], void, { rejectValue: string }>(
  "sizes/fetchAll",
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetchSizesApi();
      if (Number(response.data.EC) !== 0) return rejectWithValue(response.data.EM);
      return response.data.DT;
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Không thể lấy danh sách size"));
    }
  }
);

export const createSizeThunk = createAsyncThunk<
  SizeDto,
  CreateSizeInput,
  { rejectValue: string }
>(
  "sizes/create",
  async (sizeData, { rejectWithValue }) => {
    try {
      const response = await createSizeApi(sizeData);
      if (Number(response.data.EC) !== 0) return rejectWithValue(response.data.EM);
      return response.data.DT;
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Không thể tạo size"));
    }
  }
);

export const updateSizeThunk = createAsyncThunk<
  SizeDto,
  UpdateSizeInput,
  { rejectValue: string }
>(
  "sizes/update",
  async (sizeData, { rejectWithValue }) => {
    try {
      const response = await updateSizeApi(sizeData);
      if (Number(response.data.EC) !== 0) return rejectWithValue(response.data.EM);
      return response.data.DT;
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Không thể cập nhật size"));
    }
  }
);

export const deleteSizeThunk = createAsyncThunk<number, number, { rejectValue: string }>(
  "sizes/delete",
  async (sizeId, { rejectWithValue }) => {
    try {
      const response = await deleteSizeApi(sizeId);
      if (Number(response.data.EC) !== 0) return rejectWithValue(response.data.EM);
      return sizeId;
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Không thể xóa size"));
    }
  }
);

const initialState: SizeState = {
  sizes: [],
  status: "idle",
  error: null,
  mutationStatus: "idle",
  mutationError: null,
};

const sizeSlice = createSlice({
  name: "sizes",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSizes.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchSizes.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.sizes = action.payload || [];
      })
      .addCase(fetchSizes.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? action.error?.message ?? null;
      })
      .addCase(createSizeThunk.pending, (state) => {
        state.mutationStatus = "loading";
        state.mutationError = null;
      })
      .addCase(createSizeThunk.fulfilled, (state, action) => {
        state.mutationStatus = "succeeded";
        if (action.payload) {
          state.sizes.push(action.payload);
        }
      })
      .addCase(createSizeThunk.rejected, (state, action) => {
        state.mutationStatus = "failed";
        state.mutationError = action.payload ?? action.error?.message ?? null;
      })
      .addCase(updateSizeThunk.pending, (state) => {
        state.mutationStatus = "loading";
        state.mutationError = null;
      })
      .addCase(updateSizeThunk.fulfilled, (state, action) => {
        state.mutationStatus = "succeeded";
        if (action.payload) {
          state.sizes = state.sizes.map((size) =>
            size.id === action.payload.id
              ? { ...size, ...action.payload }
              : size
          );
        }
      })
      .addCase(updateSizeThunk.rejected, (state, action) => {
        state.mutationStatus = "failed";
        state.mutationError = action.payload ?? action.error?.message ?? null;
      })
      .addCase(deleteSizeThunk.pending, (state) => {
        state.mutationStatus = "loading";
        state.mutationError = null;
      })
      .addCase(deleteSizeThunk.fulfilled, (state, action) => {
        state.mutationStatus = "succeeded";
        state.sizes = state.sizes.filter((size) => size.id !== action.payload);
      })
      .addCase(deleteSizeThunk.rejected, (state, action) => {
        state.mutationStatus = "failed";
        state.mutationError = action.payload ?? action.error?.message ?? null;
      });
  },
});

export default sizeSlice.reducer;
