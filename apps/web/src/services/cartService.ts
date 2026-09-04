import axios from "../middlewares/axiosConfig";
import type { CartItem } from "../utils/localStorageCart";
import type { ApiEnvelope, EntityId } from "../types/http";

export interface UpdateCartItemInput {
  cartProductSizeId: EntityId;
  quantity: number;
}

export interface AddCartItemInput {
  id: number;
  sizeId: number;
  quantity: number;
}

const getCart = (userId: EntityId) => {
  return axios.get<ApiEnvelope<CartItem[]>>(`/cart/read/${userId}`);
};
const addItemToCart = (cartItem: AddCartItemInput) => {
  return axios.post<ApiEnvelope<null>>("/cart/add", cartItem);
};
const updateItemInCart = (cartItem: UpdateCartItemInput) => {
  return axios.put<ApiEnvelope<null>>("/cart/update", cartItem);
};
const deleteItemInCart = (cartProductSizeId: EntityId) => {
  return axios.delete<ApiEnvelope<null>>(`/cart/delete/${cartProductSizeId}`);
};
export { getCart, addItemToCart, updateItemInCart, deleteItemInCart };
