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
  let transition: Promise<unknown>;
  if (updatedData.status === "CONFIRMED") {
    transition = axios.post(`/order/${orderId}/confirm`, {});
  } else if (updatedData.status === "CANCELLED") {
    transition = axios.post(`/order/${orderId}/cancel`, {
      reason: "Cancelled by an authorized user",
    });
  } else {
    return Promise.reject(new TypeError(`Unsupported order transition: ${updatedData.status}`));
  }
  return transition.then(() => getOrder(orderId));
};

const getOrder = (orderId: EntityId) => {
  return axios.get<ApiEnvelope<OrderDto>>(`/order/${orderId}`);
};

const getOrdersByUserId = (userId: EntityId) => {
  return axios.get<ApiEnvelope<OrderDto[]>>(`/order/read/${userId}`);
};

const deleteOrder = (orderId: EntityId) => {
  return axios.post<ApiEnvelope<{ orderId: string }>>(`/order/${orderId}/cancel`, {
    reason: "Cancelled by an authorized user",
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
