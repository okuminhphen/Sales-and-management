import axios from "../middlewares/axiosConfig";
import type { ProductDto } from "../types/catalog";
import type { ApiEnvelope, EntityId } from "../types/http";

const getProducts = () => {
  return axios.get<ApiEnvelope<ProductDto[]>>("/product/read");
};

const getProductById = (idProduct: EntityId) => {
  return axios.get<ApiEnvelope<ProductDto>>(`/product/${idProduct}`);
};

const deleteProduct = (productId: EntityId) => {
  return axios.delete<ApiEnvelope<null>>("/product/delete", { data: { id: productId } });
};

const updateProductAPI = (id: EntityId, formData: FormData) => {
  return axios.put<ApiEnvelope<ProductDto>>(`/product/update/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

const fetchCategory = () => {
  return axios.get("/category/read");
};

const createNewProduct = (formData: FormData) => {
  return axios.post<ApiEnvelope<ProductDto>>("/product/create", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

const getRecommendProducts = (productId: EntityId) => {
  return axios.get<ApiEnvelope<ProductDto[]>>(`/product/recommend/${productId}`);
};

const getRecommendProductsForUser = (userId: EntityId) => {
  return axios.get<ApiEnvelope<ProductDto[]>>("/recommend-product", { params: { userId } });
};

export {
  createNewProduct,
  getProducts,
  fetchCategory,
  deleteProduct,
  updateProductAPI,
  getProductById,
  getRecommendProducts,
  getRecommendProductsForUser,
};
