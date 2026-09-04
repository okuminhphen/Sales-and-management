import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import {
  getProducts,
  createNewProduct,
  deleteProduct,
  updateProductAPI,
} from "../../services/productService";
import { toast } from "react-toastify";
import type { ProductDto } from "../../types/catalog";
import type { ApiEnvelope } from "../../types/http";

type RequestStatus = "idle" | "loading" | "succeeded" | "failed";

interface ProductState {
  products: ProductDto[];
  status: RequestStatus;
  error: string | null;
  createStatus: RequestStatus;
  updateStatus: RequestStatus;
  deleteStatus: RequestStatus;
}

interface UpdateProductInput {
  id: number;
  productData: FormData;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError<ApiEnvelope<unknown>>(error)) return fallback;
  return error.response?.data?.EM || fallback;
};

// Fetch products
export const fetchProducts = createAsyncThunk<ProductDto[], void, { rejectValue: string }>(
  "products/fetchProducts",
  async () => {
    let response = await getProducts();
    return response.data.DT;
  }
);

// Create product
export const createProduct = createAsyncThunk<
  ProductDto,
  FormData,
  { rejectValue: string }
>(
  "products/createProduct",
  async (productData, { rejectWithValue }) => {
    try {
      let response = await createNewProduct(productData);

      if (response.data.EC === 0) {
        toast.success(response.data.EM);
        return response.data.DT;
      } else {
        toast.error(response.data.EM);
        return rejectWithValue(response.data.EM);
      }
    } catch (error: unknown) {
      console.error("Lỗi khi tạo sản phẩm:", error);
      const errorMessage = apiErrorMessage(error, "Có lỗi xảy ra khi tạo sản phẩm");
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Update product
export const updateProductAction = createAsyncThunk<
  ProductDto,
  UpdateProductInput,
  { rejectValue: string }
>(
  "product/updateProduct",
  async ({ id, productData }, { rejectWithValue }) => {
    try {
      let response = await updateProductAPI(id, productData);

      if (response.data.EC === 0) {
        toast.success(response.data.EM);
        return response.data.DT;
      } else {
        toast.error(response.data.EM);
        return rejectWithValue(response.data.EM);
      }
    } catch (error: unknown) {
      console.error("Lỗi khi cập nhật sản phẩm:", error);
      const errorMessage = apiErrorMessage(error, "Có lỗi xảy ra khi cập nhật sản phẩm");
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Delete product
export const deleteProductAction = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>(
  "products/deleteProduct",
  async (productId, { rejectWithValue }) => {
    try {
      console.log("Deleting product with id:", productId);
      let response = await deleteProduct(productId);

      if (response.data.EC === 0) {
        toast.success(response.data.EM);
        return productId;
      } else {
        toast.error(response.data.EM);
        return rejectWithValue(response.data.EM);
      }
    } catch (error: unknown) {
      console.error("Lỗi khi xóa sản phẩm:", error);
      const errorMessage = apiErrorMessage(error, "Có lỗi xảy ra khi xóa sản phẩm");
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

const initialState: ProductState = {
  products: [],
  status: "idle",
  error: null,
  createStatus: "idle",
  updateStatus: "idle",
  deleteStatus: "idle",
};

const productSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    resetCreateStatus: (state) => {
      state.createStatus = "idle";
    },
    resetUpdateStatus: (state) => {
      state.updateStatus = "idle";
    },
    resetDeleteStatus: (state) => {
      state.deleteStatus = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch products
      .addCase(fetchProducts.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.products = Array.isArray(action.payload) ? action.payload : [];
        state.error = null;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ?? action.error?.message ?? "Không thể tải danh sách sản phẩm";
      })
      // Create product
      .addCase(createProduct.pending, (state) => {
        state.createStatus = "loading";
        state.error = null;
      })
      .addCase(createProduct.fulfilled, (state, action) => {
        state.createStatus = "succeeded";
        state.error = null;
      })
      .addCase(createProduct.rejected, (state, action) => {
        state.createStatus = "failed";
        state.error = action.payload ?? "Không thể tạo sản phẩm";
      })
      // Update product
      .addCase(updateProductAction.pending, (state) => {
        state.updateStatus = "loading";
        state.error = null;
      })
      .addCase(updateProductAction.fulfilled, (state, action) => {
        state.updateStatus = "succeeded";
        state.error = null;
      })
      .addCase(updateProductAction.rejected, (state, action) => {
        state.updateStatus = "failed";
        state.error = action.payload ?? "Không thể cập nhật sản phẩm";
      })
      // Delete product
      .addCase(deleteProductAction.pending, (state) => {
        state.deleteStatus = "loading";
        state.error = null;
      })
      .addCase(deleteProductAction.fulfilled, (state, action) => {
        state.deleteStatus = "succeeded";
        state.products = state.products.filter(
          (product) => product.id !== action.payload
        );
        state.error = null;
      })
      .addCase(deleteProductAction.rejected, (state, action) => {
        state.deleteStatus = "failed";
        state.error = action.payload ?? "Không thể xóa sản phẩm";
      });
  },
});

export const {
  clearError,
  resetCreateStatus,
  resetUpdateStatus,
  resetDeleteStatus,
} = productSlice.actions;

export default productSlice.reducer;
