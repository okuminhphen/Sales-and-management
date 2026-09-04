import axios from "../middlewares/axiosConfig";
import type { ApiEnvelope, EntityId, QueryParameters } from "../types/http";
import type { TransferReceiptDto } from "../types/inventory";

/**
 * Lấy danh sách tất cả phiếu chuyển kho
 */
const getAllTransferReceipts = (query: QueryParameters = {}) => {
  return axios.get<ApiEnvelope<TransferReceiptDto[]>>("/transfer-receipts", {
    params: query,
  });
};

/**
 * Lấy chi tiết phiếu chuyển kho
 */
const getTransferReceiptDetail = (id: EntityId) => {
  return axios.get<ApiEnvelope<TransferReceiptDto>>(`/transfer-receipts/${id}`);
};

/**
 * Duyệt phiếu chuyển kho
 */
const approveTransferReceipt = (id: EntityId) => {
  return axios.post<ApiEnvelope<TransferReceiptDto>>(`/transfer-receipts/${id}/approve`);
};

/**
 * Từ chối phiếu chuyển kho
 */
const rejectTransferReceipt = (
  id: EntityId,
  reason: string,
) => {
  return axios.post<ApiEnvelope<null>>(`/transfer-receipts/${id}/reject`, { reason });
};

/**
 * Hoàn thành phiếu chuyển kho
 */
const completeTransferReceipt = (id: EntityId) => {
  return axios.post<ApiEnvelope<TransferReceiptDto>>(`/transfer-receipts/${id}/complete`);
};

/**
 * Hủy phiếu chuyển kho
 */
const cancelTransferReceipt = (id: EntityId) => {
  return axios.post<ApiEnvelope<null>>(`/transfer-receipts/${id}/cancel`);
};

export {
  getAllTransferReceipts,
  getTransferReceiptDetail,
  approveTransferReceipt,
  rejectTransferReceipt,
  completeTransferReceipt,
  cancelTransferReceipt,
};
