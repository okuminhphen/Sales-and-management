import axios from "../middlewares/axiosConfig";
import type { ApiEnvelope, EntityId } from "../types/http";
import type {
  CreatedOrderDto,
  CreateOrderInput,
  OrderDto,
  UpdateOrderStatusInput,
} from "../types/order";

const createOrder = (orderData: CreateOrderInput) => {
  return axios.post<ApiEnvelope<CreatedOrderDto>>("/order/create", orderData);
};

const updateOrderStatus = (
  orderId: EntityId,
  updatedData: UpdateOrderStatusInput["updatedData"],
) => {
  return axios.put<ApiEnvelope<OrderDto>>(
    `/order/details/update/${orderId}`,
    updatedData,
  );
};

const getOrder = (orderId: EntityId) => {
  return axios.get<ApiEnvelope<OrderDto>>(`/order/${orderId}`);
};

const getOrdersByUserId = (userId: EntityId) => {
  return axios.get<ApiEnvelope<OrderDto[]>>(`/order/read/${userId}`);
};

const deleteOrder = (orderId: EntityId) => {
  return axios.delete<ApiEnvelope<number>>(`/order/delete`, {
    data: { id: orderId },
  });
};
const fetchAllOrders = () => {
  return axios.get<ApiEnvelope<OrderDto[]>>("/order/read");
};
const fetchOrdersByBranch = (branchId: EntityId) => {
  return axios.get<ApiEnvelope<OrderDto[]>>(`/order/branch/${branchId}`);
};
const createOrderAtBranch = (orderData: CreateOrderInput) => {
  return axios.post<ApiEnvelope<OrderDto>>("/order/in-store", orderData);
};
export {
  createOrder,
  getOrder,
  updateOrderStatus,
  getOrdersByUserId,
  deleteOrder,
  fetchAllOrders,
  fetchOrdersByBranch,
  createOrderAtBranch,
};
