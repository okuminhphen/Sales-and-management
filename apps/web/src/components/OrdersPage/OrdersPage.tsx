import React, { useEffect, useState } from "react";
import { Container, Table, Badge, Button, Tabs, Tab } from "react-bootstrap";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { fetchOrdersUserThunk } from "../../store/slices/orderSlice";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import type { OrderDto, OrderStatus } from "../../types/order";
import "./OrdersPage.scss";

type OrderFilter = OrderStatus | "ALL";

const statusConfig: Record<
  OrderStatus,
  { variant: string; text: string }
> = {
  PENDING: { variant: "warning", text: "Chờ xác nhận" },
  CONFIRMED: { variant: "info", text: "Đã xác nhận" },
  SHIPPING: { variant: "primary", text: "Đang giao" },
  COMPLETED: { variant: "success", text: "Đã giao" },
  DELIVERED: { variant: "success", text: "Đã giao" },
  CANCELLED: { variant: "danger", text: "Đã hủy" },
};

const OrdersPage = () => {
  const [activeTab, setActiveTab] = useState<OrderFilter>("ALL");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { orders, status, error } = useAppSelector((state) => state.orders);
  const loading = status === "loading";
  useEffect(() => {
    dispatch(fetchOrdersUserThunk()); // ✅ Gọi API lấy danh sách đơn hàng
  }, [dispatch]);

  const getStatusBadge = (status: OrderFilter) => {
    const config = (status !== "ALL" && statusConfig[status]) || {
      variant: "secondary",
      text: "Tất cả",
    };
    return <Badge bg={config.variant}>{config.text}</Badge>;
  };

  const filterOrders = (status: OrderFilter): OrderDto[] => {
    if (status === "ALL") return orders;
    return orders.filter((order) => order.status === status);
  };

  const formatPrice = (price: number | string) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(Number(price));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // Hiển thị 24h
    });
  };

  return (
    <Container className="orders-page py-5">
      <h2 className="mb-4">Đơn hàng của tôi</h2>

      {error && <div className="text-danger">Lỗi: {error}</div>}

      <Tabs
        activeKey={activeTab}
        onSelect={(key) => key && setActiveTab(key as OrderFilter)}
        className="mb-4"
      >
        {([
          "ALL",
          "PENDING",
          "CONFIRMED",
          "SHIPPING",
          "COMPLETED",
          "CANCELLED",
        ] satisfies OrderFilter[]).map((status) => (
          <Tab key={status} eventKey={status} title={getStatusBadge(status)}>
            <OrdersTable
              orders={filterOrders(status)}
              loading={loading}
              getStatusBadge={getStatusBadge}
              formatPrice={formatPrice}
              formatDate={formatDate}
              navigate={navigate}
            />
          </Tab>
        ))}
      </Tabs>
    </Container>
  );
};
interface OrdersTableProps {
  orders: OrderDto[];
  loading: boolean;
  getStatusBadge: (status: OrderFilter) => React.ReactNode;
  formatPrice: (price: number | string) => string;
  formatDate: (dateString?: string) => string;
  navigate: NavigateFunction;
}

const OrdersTable = ({
  orders,
  loading,
  getStatusBadge,
  formatPrice,
  formatDate,
  navigate,
}: OrdersTableProps) => {
  if (loading) {
    return <div className="text-center py-4">Đang tải...</div>;
  }

  if (!orders || orders.length === 0) {
    // ✅ Kiểm tra orders trước khi map
    return <div className="text-center py-4">Không có đơn hàng nào</div>;
  }

  return (
    <div className="table-responsive">
      <Table hover className="orders-table">
        <thead>
          <tr>
            <th>Mã đơn hàng</th>
            <th>Ngày đặt</th>
            <th>Tổng tiền</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="order-id">{order.code}</td>
              <td>{formatDate(order.orderDate)}</td>
              <td className="order-total">
                {formatPrice(order.payment?.amount || 0)}
              </td>
              <td>{getStatusBadge(order.status)}</td>
              <td>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => navigate(`/orders/details/${order.id}`)}
                >
                  Chi tiết
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
export default OrdersPage;
