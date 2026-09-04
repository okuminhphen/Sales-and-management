import axios from "../middlewares/axiosConfig";
import type { ApiEnvelope, EntityId } from "../types/http";
import type {
  CreateStockRequestInput,
  StockRequestDto,
  UpdateStockRequestInput,
} from "../types/inventory";

/* ======================================================
   ADMIN CHI NHÁNH
====================================================== */

/**
 * Lấy danh sách stock request của chi nhánh hiện tại
 */
const getMyStockRequests = (branchId: EntityId) => {
  return axios.get<ApiEnvelope<StockRequestDto[]>>(`/stock-requests/my/${branchId}`);
};

/**
 * Tạo yêu cầu tồn kho
 */
const createStockRequest = (data: CreateStockRequestInput) => {
  return axios.post<ApiEnvelope<StockRequestDto>>("/stock-requests", data);
};

/**
 * Cập nhật yêu cầu (chỉ pending)
 */
const updateStockRequestInfo = (id: EntityId, data: UpdateStockRequestInput) => {
  return axios.put<ApiEnvelope<null>>(`/stock-requests/${id}`, data);
};

/**
 * Xóa yêu cầu (chỉ pending)
 */
const deleteStockRequest = (id: EntityId) => {
  return axios.delete<ApiEnvelope<null>>(`/stock-requests/${id}`);
};

/* ======================================================
   ADMIN TỔNG
====================================================== */

/**
 * Lấy danh sách yêu cầu chờ duyệt
 */
const getPendingStockRequests = () => {
  return axios.get<ApiEnvelope<StockRequestDto[]>>("/admin/stock-requests/pending");
};

/**
 * Duyệt yêu cầu → tạo TransferReceipt
 */
const approveStockRequest = (id: EntityId) => {
  return axios.post<ApiEnvelope<null>>(`/admin/stock-requests/${id}/approve`);
};

/**
 * Từ chối yêu cầu
 */
const rejectStockRequest = (id: EntityId, note: string) => {
  return axios.post<ApiEnvelope<null>>(`/admin/stock-requests/${id}/reject`, { note });
};

export {
  // branch admin
  getMyStockRequests,
  createStockRequest,
  updateStockRequestInfo,
  deleteStockRequest,

  // super admin
  getPendingStockRequests,
  approveStockRequest,
  rejectStockRequest,
};
