import axios from "../middlewares/axiosConfig";
import type { EntityId, RequestPayload } from "../types/http";
const getAllVouchers = () => {
  return axios.get(`/voucher/read`);
};

const createVoucher = (voucherData: RequestPayload) => {
  return axios.post(`/voucher/create`, voucherData);
};

const updateVoucher = (voucherId: EntityId, voucherData: RequestPayload) => {
  return axios.put(`/voucher/update/${voucherId}`, voucherData);
};
const deleteVoucher = (voucherId: EntityId) => {
  return axios.delete(`/voucher/delete/${voucherId}`);
};
export { getAllVouchers, createVoucher, updateVoucher, deleteVoucher };
