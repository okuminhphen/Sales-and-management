// @ts-nocheck
import React, { useState, useEffect, useMemo } from "react";
import { Container, Row, Col, Card, Button } from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import {
  FaDollarSign,
  FaBox,
  FaUserFriends,
  FaClipboardList,
} from "react-icons/fa";
import "./AdminPage.scss";
import { fetchProducts } from "../../store/slices/productSlice";
import { fetchOrdersThunk } from "../../store/slices/orderSlice";
import { fetchUsers } from "../../store/slices/userSlice";
import { BACKEND_URL } from "../../config/constants";

// Import các component quản lý
import Products from "../../components/ManageProducts/Products";
import ManageUsers from "../../components/ManageUsers/ManageUsers";
import ManageOrders from "../../components/ManageOrders/ManageOrders";
import ManageBanners from "../../components/ManageBanners/ManageBanners";
import Voucher from "../VoucherPage/Voucher";
import BranchManager from "../BranchManagerPage/BranchManager";
import BranchDetail from "../BranchDetail/BranchDetail";
import Role from "../RolePage/Role";
import Category from "../CategoryPage/Category";
import AdminAccountManagementPage from "../AdminAccountManagementPage/AdminAccountManagementPage";
import SizePage from "../SizePage/SizePage";
import InventoryPage from "../InventoryPage/InventoryPage";
import StockRequestPage from "../StockRequestPage/StockRequestPage";
import StockRequestCreatePage from "../StockRequestCreatePage/StockRequestCreatePage";
import StockRequestAdminPage from "../StockRequestAdminPage/StockRequestAdminPage";
import ConversationPage from "../ConversationPage/ConversationPage";
import TransferReceiptPage from "../TransferReceiptPage/TransferReceiptPage";
import RevenueChart from "../../components/RevenueChart/RevenueChart";
import OrderStatusChart from "../../components/OrderStatusChart/OrderStatusChart";
import AdminTopNavbar from "../../components/AdminTopNavbar/AdminTopNavbar";
import AdminLeftNavbar from "../../components/AdminLeftNavbar/AdminLeftNavbar";

const AdminPage = () => {
  const dispatch = useDispatch<any>();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to light
    return localStorage.getItem("admin_theme") || "light";
  });

  // Redux selectors
  const { products } = useSelector((state: any) => state.product);
  const { orders } = useSelector((state: any) => state.orders);
  const { users } = useSelector((state: any) => state.user);
  const { adminInfo } = useSelector((state: any) => state.admin);
  // Check if user is SUPER_ADMIN
  const isSuperAdmin = useMemo(() => {
    return adminInfo?.role === "SUPER_ADMIN";
  }, [adminInfo]);

  // Fetch data when dashboard is active
  useEffect(() => {
    if (activeTab === "dashboard") {
      dispatch(fetchProducts());
      if (adminInfo) {
        const role = adminInfo.role || "SUPER_ADMIN";
        const branchId = adminInfo.branchId || null;
        dispatch(fetchOrdersThunk({ role, branchId }));
      }
      dispatch(fetchUsers());
    }
  }, [activeTab, dispatch, adminInfo]);

  // Calculate statistics
  const statistics = useMemo(() => {
    // Calculate revenue from completed orders
    const completedOrders = orders.filter(
      (order) => order.status === "completed" || order.status === "delivered"
    );

    // Get current month and previous month for comparison
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentMonthOrders = completedOrders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return (
        orderDate.getMonth() === currentMonth &&
        orderDate.getFullYear() === currentYear
      );
    });

    const previousMonthOrders = completedOrders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return (
        orderDate.getMonth() === previousMonth &&
        orderDate.getFullYear() === previousYear
      );
    });

    const currentMonthRevenue = currentMonthOrders.reduce((sum, order) => {
      return sum + (Number(order.totalPrice) || 0);
    }, 0);

    const previousMonthRevenue = previousMonthOrders.reduce((sum, order) => {
      return sum + (Number(order.totalPrice) || 0);
    }, 0);

    const revenueChange =
      previousMonthRevenue > 0
        ? ((currentMonthRevenue - previousMonthRevenue) /
            previousMonthRevenue) *
          100
        : 0;

    // Products count
    const productsCount = products.length || 0;
    const previousMonthProducts = products.filter((product) => {
      const productDate = new Date(product.createdAt);
      return (
        productDate.getMonth() === previousMonth &&
        productDate.getFullYear() === previousYear
      );
    }).length;
    const productsChange =
      previousMonthProducts > 0
        ? ((productsCount - previousMonthProducts) / previousMonthProducts) *
          100
        : 0;

    // Orders count
    const currentMonthOrdersCount = orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return (
        orderDate.getMonth() === currentMonth &&
        orderDate.getFullYear() === currentYear
      );
    }).length;

    const previousMonthOrdersCount = orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return (
        orderDate.getMonth() === previousMonth &&
        orderDate.getFullYear() === previousYear
      );
    }).length;

    const ordersChange =
      previousMonthOrdersCount > 0
        ? ((currentMonthOrdersCount - previousMonthOrdersCount) /
            previousMonthOrdersCount) *
          100
        : 0;

    // Users count
    const usersCount = users.length || 0;
    const previousMonthUsers = users.filter((user) => {
      const userDate = new Date(user.createdAt);
      return (
        userDate.getMonth() === previousMonth &&
        userDate.getFullYear() === previousYear
      );
    }).length;
    const usersChange =
      previousMonthUsers > 0
        ? ((usersCount - previousMonthUsers) / previousMonthUsers) * 100
        : 0;

    return {
      revenue: currentMonthRevenue,
      revenueChange,
      productsCount,
      productsChange,
      ordersCount: currentMonthOrdersCount,
      ordersChange,
      usersCount,
      usersChange,
    };
  }, [products, orders, users]);

  // Get recent orders (last 4)
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 4);
  }, [orders]);

  // Get top products (by order count or sales)
  const topProducts = useMemo(() => {
    // Count how many times each product appears in orders
    const productSales = {};
    orders.forEach((order) => {
      if (order.OrderDetails && Array.isArray(order.OrderDetails)) {
        order.OrderDetails.forEach((detail) => {
          const productId = detail.productId;
          if (!productSales[productId]) {
            productSales[productId] = {
              productId,
              quantity: 0,
              totalRevenue: 0,
            };
          }
          productSales[productId].quantity += detail.quantity || 0;
          productSales[productId].totalRevenue +=
            (detail.price || 0) * (detail.quantity || 0);
        });
      }
    });

    // Get top 4 products by quantity sold
    const topProductsList = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 4)
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return {
          ...product,
          quantitySold: item.quantity,
          totalRevenue: item.totalRevenue,
        };
      })
      .filter((item) => item.id); // Filter out undefined products

    return topProductsList;
  }, [orders, products]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("admin_theme", newTheme);

    // Apply theme to body
    if (newTheme === "dark") {
      document.body.classList.add("dark-theme");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.body.classList.remove("dark-theme");
      document.documentElement.setAttribute("data-theme", "light");
    }
  };

  // Apply theme on mount
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.body.classList.remove("dark-theme");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, [theme]);

  // Hàm render nội dung theo tab
  const renderContent = () => {
    // Danh sách các tab chỉ dành cho SUPER_ADMIN
    const superAdminOnlyTabs = [
      "products",
      "users",
      "banners",
      "vouchers",
      "branch-manager",
      "branch-detail",
      "roles",
      "categorys",
      "admin-accounts",
      "sizes",
      "chat",
      "stock-request-admin",
      "transfer-receipt",
    ];

    // Danh sách các tab chỉ dành cho BRANCH_MANAGER
    const branchManagerOnlyTabs = ["stock-request", "stock-request-create"];

    // Kiểm tra nếu BRANCH_MANAGER cố truy cập tab không được phép
    if (!isSuperAdmin && superAdminOnlyTabs.includes(activeTab)) {
      return (
        <div className="text-center py-5">
          <h4>Không có quyền truy cập</h4>
          <p className="text-muted">
            Bạn không có quyền truy cập chức năng này. Vui lòng liên hệ
            SUPER_ADMIN.
          </p>
          <Button variant="primary" onClick={() => setActiveTab("dashboard")}>
            Quay về Dashboard
          </Button>
        </div>
      );
    }

    // Kiểm tra nếu SUPER_ADMIN cố truy cập tab chỉ dành cho BRANCH_MANAGER
    if (isSuperAdmin && branchManagerOnlyTabs.includes(activeTab)) {
      return (
        <div className="text-center py-5">
          <h4>Không có quyền truy cập</h4>
          <p className="text-muted">
            Chức năng này chỉ dành cho BRANCH_MANAGER. Vui lòng sử dụng "Quản lý
            yêu cầu tồn kho" để xem tất cả yêu cầu.
          </p>
          <Button
            variant="primary"
            onClick={() => setActiveTab("stock-request-admin")}
          >
            Đi đến Quản lý yêu cầu tồn kho
          </Button>
        </div>
      );
    }

    switch (activeTab) {
      case "dashboard":
        return renderDashboard();
      case "products":
        return <Products />;
      case "inventory":
        return <InventoryPage />;
      case "users":
        return <ManageUsers />;
      case "orders":
        return <ManageOrders />;
      case "banners":
        return <ManageBanners />;
      case "vouchers":
        return <Voucher />;
      case "branch-manager":
        return (
          <BranchManager
            setSelectedBranchId={setSelectedBranchId}
            setActiveTab={setActiveTab}
          />
        );
      case "branch-detail":
        return selectedBranchId ? (
          <BranchDetail branchId={selectedBranchId} />
        ) : (
          <div className="text-center py-5">
            <h4>Vui lòng chọn chi nhánh</h4>
          </div>
        );
      case "roles":
        return <Role />;
      case "categorys":
        return <Category />;
      case "admin-accounts":
        return <AdminAccountManagementPage />;
      case "sizes":
        return <SizePage />;
      case "stock-request":
        return <StockRequestPage setActiveTab={setActiveTab} />;
      case "stock-request-create":
        return <StockRequestCreatePage setActiveTab={setActiveTab} />;
      case "stock-request-admin":
        return <StockRequestAdminPage />;
      case "transfer-receipt":
        return <TransferReceiptPage />;
      case "chat":
        return <ConversationPage />;
      default:
        return (
          <div className="text-center py-5">
            <h4>Chức năng {activeTab} đang được phát triển</h4>
            <p className="text-muted">
              Chức năng này sẽ được cập nhật trong thời gian tới.
            </p>
          </div>
        );
    }
  };

  // Hàm render Dashboard
  const renderDashboard = () => {
    return (
      <div className="dashboard-content">
        {/* <h2 className="page-title mb-4">Tổng quan</h2> */}
        {/* Stats */}
        <Row className="g-4 mb-4">
          <Col md={6} lg={3}>
            <Card className="stat-card h-100">
              <Card.Body>
                <div className="d-flex align-items-center">
                  <div className="stat-icon bg-primary">
                    <FaDollarSign />
                  </div>
                  <div className="ms-3">
                    <h6 className="stat-label">Doanh thu</h6>
                    <h3 className="stat-value mb-0">
                      ₫
                      {statistics.revenue.toLocaleString("vi-VN", {
                        maximumFractionDigits: 0,
                      })}
                    </h3>
                    <small
                      className={
                        statistics.revenueChange >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      <i
                        className={`fas fa-arrow-${
                          statistics.revenueChange >= 0 ? "up" : "down"
                        }`}
                      ></i>{" "}
                      {Math.abs(statistics.revenueChange).toFixed(1)}% so với
                      tháng trước
                    </small>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={3}>
            <Card className="stat-card h-100">
              <Card.Body>
                <div className="d-flex align-items-center">
                  <div className="stat-icon bg-success">
                    <FaBox />
                  </div>
                  <div className="ms-3">
                    <h6 className="stat-label">Sản phẩm</h6>
                    <h3 className="stat-value mb-0">
                      {statistics.productsCount}
                    </h3>
                    <small
                      className={
                        statistics.productsChange >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      <i
                        className={`fas fa-arrow-${
                          statistics.productsChange >= 0 ? "up" : "down"
                        }`}
                      ></i>{" "}
                      {Math.abs(statistics.productsChange).toFixed(1)}% so với
                      tháng trước
                    </small>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={3}>
            <Card className="stat-card h-100">
              <Card.Body>
                <div className="d-flex align-items-center">
                  <div className="stat-icon bg-warning">
                    <FaClipboardList />
                  </div>
                  <div className="ms-3">
                    <h6 className="stat-label">Đơn hàng</h6>
                    <h3 className="stat-value mb-0">
                      {statistics.ordersCount}
                    </h3>
                    <small
                      className={
                        statistics.ordersChange >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      <i
                        className={`fas fa-arrow-${
                          statistics.ordersChange >= 0 ? "up" : "down"
                        }`}
                      ></i>{" "}
                      {Math.abs(statistics.ordersChange).toFixed(1)}% so với
                      tháng trước
                    </small>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6} lg={3}>
            <Card className="stat-card h-100">
              <Card.Body>
                <div className="d-flex align-items-center">
                  <div className="stat-icon bg-info">
                    <FaUserFriends />
                  </div>
                  <div className="ms-3">
                    <h6 className="stat-label">Khách hàng</h6>
                    <h3 className="stat-value mb-0">{statistics.usersCount}</h3>
                    <small
                      className={
                        statistics.usersChange >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      <i
                        className={`fas fa-arrow-${
                          statistics.usersChange >= 0 ? "up" : "down"
                        }`}
                      ></i>{" "}
                      {Math.abs(statistics.usersChange).toFixed(1)}% so với
                      tháng trước
                    </small>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Charts */}
        <Row className="mb-4">
          <Col lg={8}>
            <RevenueChart orders={orders} />
          </Col>
          <Col lg={4}>
            <OrderStatusChart orders={orders} />
          </Col>
        </Row>

        {/* Recent Orders */}
        <Row className="mb-4">
          <Col lg={12}>
            <Card className="h-100">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Đơn hàng gần đây</h5>
                <Button variant="outline-primary" size="sm">
                  Xem tất cả
                </Button>
              </Card.Header>
              <Card.Body>
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Khách hàng</th>
                        <th>Sản phẩm</th>
                        <th>Ngày</th>
                        <th>Tổng tiền</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.length > 0 ? (
                        recentOrders.map((order) => {
                          const orderDate = new Date(order.createdAt);
                          const formattedDate =
                            orderDate.toLocaleDateString("vi-VN");
                          const customerName =
                            order.customerName || "Khách hàng";
                          const productsList =
                            order.ordersDetails
                              ?.map((detail) => detail.productName)
                              .filter(Boolean)
                              .join(", ") || "N/A";
                          const getStatusBadge = (status) => {
                            const statusMap = {
                              pending: {
                                class: "bg-warning text-dark",
                                text: "Chờ xử lý",
                              },
                              confirmed: {
                                class: "bg-primary",
                                text: "Đã xác nhận",
                              },
                              processing: {
                                class: "bg-info",
                                text: "Đang xử lý",
                              },
                              shipping: {
                                class: "bg-warning text-dark",
                                text: "Đang giao",
                              },
                              delivered: {
                                class: "bg-success",
                                text: "Đã giao",
                              },
                              completed: {
                                class: "bg-success",
                                text: "Hoàn thành",
                              },
                              cancelled: {
                                class: "bg-danger",
                                text: "Đã hủy",
                              },
                            };
                            const statusInfo = statusMap[status] || {
                              class: "bg-secondary",
                              text: status,
                            };
                            return (
                              <span className={`badge ${statusInfo.class}`}>
                                {statusInfo.text}
                              </span>
                            );
                          };

                          return (
                            <tr key={order.id}>
                              <td>#{order.code || order.id}</td>
                              <td>{customerName}</td>
                              <td>{productsList}</td>
                              <td>{formattedDate}</td>
                              <td>
                                ₫
                                {Number(order.totalPrice || 0).toLocaleString(
                                  "vi-VN"
                                )}
                              </td>
                              <td>{getStatusBadge(order.status)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" className="text-center py-4">
                            Chưa có đơn hàng nào
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Top Products
        <Row>
          <Col lg={12}>
            <Card className="h-100">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Sản phẩm bán chạy</h5>
                <Button variant="outline-primary" size="sm">
                  Xem tất cả
                </Button>
              </Card.Header>
              <Card.Body>
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th>Danh mục</th>
                        <th>Giá</th>
                        <th>Đã bán</th>
                        <th>Còn lại</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.length > 0 ? (
                        topProducts.map((product) => {
                          const productImages = product.images
                            ? typeof product.images === "string"
                              ? JSON.parse(product.images)
                              : product.images
                            : [];
                          const firstImage =
                            productImages.length > 0
                              ? `${BACKEND_URL}${productImages[0]}`
                              : "https://via.placeholder.com/40";

                          // Get total stock from inventory if available
                          const totalStock = 0; // You can calculate this from inventory data if needed

                          return (
                            <tr key={product.id}>
                              <td>
                                <div className="d-flex align-items-center">
                                  <img
                                    src={firstImage}
                                    alt={product.name}
                                    className="rounded me-2"
                                    width="40"
                                    height="40"
                                    style={{
                                      objectFit: "cover",
                                    }}
                                    onError={(e) => {
                                      e.target.src =
                                        "https://via.placeholder.com/40";
                                    }}
                                  />
                                  <div>{product.name}</div>
                                </div>
                              </td>
                              <td>
                                {product.Category?.name || "Không có danh mục"}
                              </td>
                              <td>
                                ₫
                                {Number(product.price || 0).toLocaleString(
                                  "vi-VN"
                                )}
                              </td>
                              <td>{product.quantitySold || 0}</td>
                              <td>{totalStock}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    totalStock > 10
                                      ? "bg-success"
                                      : totalStock > 0
                                      ? "bg-warning"
                                      : "bg-danger"
                                  }`}
                                >
                                  {totalStock > 10
                                    ? "Còn hàng"
                                    : totalStock > 0
                                    ? "Sắp hết"
                                    : "Hết hàng"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" className="text-center py-4">
                            Chưa có dữ liệu sản phẩm bán chạy
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row> */}
      </div>
    );
  };

  return (
    <Container
      fluid
      className={`admin-page ${theme === "dark" ? "dark-theme" : ""} ${
        isSidebarCollapsed ? "sidebar-collapsed" : ""
      }`}
    >
      {/* Top Navbar */}
      <AdminTopNavbar
        adminInfo={adminInfo}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      {/* Left Sidebar */}
      <AdminLeftNavbar
        isSidebarCollapsed={isSidebarCollapsed}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSuperAdmin={isSuperAdmin}
        selectedBranchId={selectedBranchId}
      />

      {/* Main Content */}
      <div
        className={`main-content-wrapper ${
          isSidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <div className="content-wrapper">{renderContent()}</div>
      </div>
    </Container>
  );
};

export default AdminPage;
