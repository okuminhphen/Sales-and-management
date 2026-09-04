import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  addItemToCart,
  deleteItemInCart,
  getCart,
  updateItemInCart,
  type UpdateCartItemInput,
} from "../../services/cartService";
import {
  addToLocalStorageCart,
  clearLocalStorageCart,
  getLocalStorageCart,
  removeFromLocalStorageCart,
  updateLocalStorageCartItem,
  type CartItem,
  type NewCartItem,
} from "../../utils/localStorageCart";
import type { UserSession } from "../../types/auth";

interface CartState {
  cartItems: CartItem[];
  totalQuantity: number;
  totalPrice: number;
  error: string | null;
}

interface CartThunkState {
  user: { currentUser: UserSession | null };
}

interface CartThunkConfig {
  state: CartThunkState;
  rejectValue: string;
}

const parseImages = (images: CartItem["images"]): string[] => {
  if (Array.isArray(images)) return images;
  if (!images) return [];
  try {
    const parsed: unknown = JSON.parse(images);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [images];
  } catch {
    return [images];
  }
};

const normalizeCart = (items: CartItem[]): CartItem[] =>
  items.map((item) => ({ ...item, images: parseImages(item.images) }));

const replaceCart = (state: CartState, items: CartItem[]): void => {
  state.cartItems = normalizeCart(items);
  state.totalQuantity = state.cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  state.totalPrice = state.cartItems.reduce(
    (sum, item) => sum + Number(item.price ?? 0) * item.quantity,
    0,
  );
  state.error = null;
};

const loadCart = async (userId: number | undefined): Promise<CartItem[]> => {
  if (!userId) return getLocalStorageCart();
  const response = await getCart(userId);
  if (Number(response.data.EC) !== 0 || !Array.isArray(response.data.DT)) {
    throw new Error(response.data.EM || "Dữ liệu giỏ hàng không hợp lệ");
  }
  return response.data.DT;
};

export const fetchCart = createAsyncThunk<CartItem[], void, CartThunkConfig>(
  "cart/fetchCart",
  async (_, { getState, rejectWithValue }) => {
    try {
      return await loadCart(getState().user.currentUser?.userId);
    } catch {
      return rejectWithValue("Lỗi khi lấy giỏ hàng!");
    }
  },
);

export const addToCartAsync = createAsyncThunk<
  CartItem[],
  NewCartItem,
  CartThunkConfig
>("cart/addToCart", async (cartItem, { getState, rejectWithValue }) => {
  try {
    const userId = getState().user.currentUser?.userId;
    if (!userId) return addToLocalStorageCart(cartItem);

    const response = await addItemToCart({
      id: cartItem.productId,
      sizeId: cartItem.sizeId,
      quantity: cartItem.quantity,
    });
    if (Number(response.data.EC) !== 0) throw new Error(response.data.EM);
    return await loadCart(userId);
  } catch {
    return rejectWithValue("Lỗi khi thêm vào giỏ hàng!");
  }
});

export const updateCartItemQuantityAsync = createAsyncThunk<
  CartItem[],
  UpdateCartItemInput,
  CartThunkConfig
>(
  "cart/updateQuantity",
  async ({ cartProductSizeId, quantity }, { getState, rejectWithValue }) => {
    try {
      const userId = getState().user.currentUser?.userId;
      if (!userId) return updateLocalStorageCartItem(cartProductSizeId, quantity);

      const response = await updateItemInCart({ cartProductSizeId, quantity });
      if (Number(response.data.EC) !== 0) throw new Error(response.data.EM);
      return await loadCart(userId);
    } catch {
      return rejectWithValue("Lỗi khi cập nhật số lượng!");
    }
  },
);

export const removeCartItemAsync = createAsyncThunk<
  CartItem[],
  string | number,
  CartThunkConfig
>("cart/removeCartItem", async (itemId, { getState, rejectWithValue }) => {
  try {
    const userId = getState().user.currentUser?.userId;
    if (!userId) return removeFromLocalStorageCart(itemId);

    const response = await deleteItemInCart(itemId);
    if (Number(response.data.EC) !== 0) throw new Error(response.data.EM);
    return await loadCart(userId);
  } catch {
    return rejectWithValue("Lỗi khi xóa sản phẩm khỏi giỏ hàng!");
  }
});

const initialState: CartState = {
  cartItems: [],
  totalQuantity: 0,
  totalPrice: 0,
  error: null,
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    clearCart: (state) => {
      replaceCart(state, []);
      clearLocalStorageCart();
    },
    loadLocalStorageCart: (state) => {
      replaceCart(state, getLocalStorageCart());
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCart.fulfilled, (state, action) => {
        replaceCart(state, action.payload);
      })
      .addCase(addToCartAsync.fulfilled, (state, action) => {
        replaceCart(state, action.payload);
      })
      .addCase(updateCartItemQuantityAsync.fulfilled, (state, action) => {
        replaceCart(state, action.payload);
      })
      .addCase(removeCartItemAsync.fulfilled, (state, action) => {
        replaceCart(state, action.payload);
      })
      .addMatcher(
        (action): action is { type: string; payload?: string } =>
          action.type.startsWith("cart/") && action.type.endsWith("/rejected"),
        (state, action) => {
          state.error = action.payload ?? "Thao tác giỏ hàng thất bại";
        },
      );
  },
});

export const { clearCart, loadLocalStorageCart } = cartSlice.actions;
export default cartSlice.reducer;
