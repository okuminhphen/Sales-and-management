import axios from "../middlewares/axiosConfig";
import type { CreateSizeInput, SizeDto, UpdateSizeInput } from "../types/catalog";
import type { ApiEnvelope } from "../types/http";
const fetchSizes = () => {
  return axios.get<ApiEnvelope<SizeDto[]>>("/size/read");
};
const createSize = (data: CreateSizeInput) => {
  return axios.post<ApiEnvelope<SizeDto>>("/size/create", data);
};
const updateSize = (data: UpdateSizeInput) => {
  return axios.put<ApiEnvelope<SizeDto>>("/size/update", data);
};
const deleteSize = (id: number) => {
  return axios.delete<ApiEnvelope<null>>(`/size/delete/${id}`);
};
export { fetchSizes, createSize, updateSize, deleteSize };
