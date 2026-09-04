import axios from "../middlewares/axiosConfig";
import type { EntityId, RequestPayload } from "../types/http";
const getAllCategorys = () => {
  return axios.get(`/category/read`);
};

const createCategory = (categoryData: RequestPayload) => {
  return axios.post(`/category/create`, categoryData);
};

const updateCategory = (categoryId: EntityId, categoryData: RequestPayload) => {
  return axios.put(`/category/update/${categoryId}`, categoryData);
};
const deleteCategory = (categoryId: EntityId) => {
  return axios.delete(`/category/delete/${categoryId}`);
};
export { getAllCategorys, createCategory, updateCategory, deleteCategory };
