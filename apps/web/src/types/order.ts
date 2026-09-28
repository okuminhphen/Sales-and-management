import type { RequestPayload } from "./http";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SHIPPING"
  | "COMPLETED"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderDetailDto {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImage?: string | string[];
  productSize?: string;
  quantity: number;
  priceAtOrder: number | string;
  totalPrice: number | string;
}

export interface OrderDto {
  id: string;
  userId?: string | null;
  branchId?: string | null;
  code?: string;
  orderDate?: string;
  createdAt?: string;
  totalPrice: number | string;
  status: OrderStatus;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingAddress?: string;
  message?: string;
  ordersDetails?: OrderDetailDto[];
  payment?: PaymentDto;
}

export interface PaymentDto extends RequestPayload {
  id?: string;
  amount?: number | string;
  status?: string;
  transactionId?: string | null;
}

export interface CreatedOrderDto {
  orderId: string;
  code: string;
}

export interface FetchOrdersInput {
  role: string;
  branchId?: string | null;
}

export interface UpdateOrderStatusInput {
  orderId: number | string;
  updatedData: { status: OrderStatus };
}

export type CreateOrderInput = RequestPayload;
