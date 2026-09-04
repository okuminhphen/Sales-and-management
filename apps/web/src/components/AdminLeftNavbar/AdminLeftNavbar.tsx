// @ts-nocheck
import React from "react";
import { Nav } from "react-bootstrap";
import {
  FaHome,
  FaBoxes,
  FaUsers,
  FaShoppingCart,
  FaTags,
  FaImages,
  FaTicketAlt,
  FaBuilding,
  FaUserShield,
  FaRuler,
  FaWarehouse,
  FaClipboardCheck,
  FaComments,
  FaExchangeAlt,
} from "react-icons/fa";
import "./AdminLeftNavbar.scss";

const AdminLeftNavbar = ({
  isSidebarCollapsed,
  activeTab,
  setActiveTab,
  isSuperAdmin,
  selectedBranchId,
}) => {
  return (
    <div
      className={`admin-left-navbar ${isSidebarCollapsed ? "collapsed" : ""}`}
    >
      <div className="sidebar-header sticky-header">
        <h3>Admin Panel</h3>
      </div>
      <div className="sidebar-content">
        <Nav className="flex-column">
          <Nav.Link
            className={activeTab === "dashboard" ? "active" : ""}
            onClick={() => setActiveTab("dashboard")}
          >
            <FaHome /> {!isSidebarCollapsed && <span>Dashboard</span>}
          </Nav.Link>
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "products" ? "active" : ""}
              onClick={() => setActiveTab("products")}
            >
              <FaBoxes /> {!isSidebarCollapsed && <span>Sản phẩm</span>}
            </Nav.Link>
          )}
          <Nav.Link
            className={activeTab === "inventory" ? "active" : ""}
            onClick={() => setActiveTab("inventory")}
          >
            <FaWarehouse /> {!isSidebarCollapsed && <span>Tồn kho</span>}
          </Nav.Link>
          {/* Stock Request - chỉ dành cho BRANCH_MANAGER */}
          {!isSuperAdmin && (
            <>
              <Nav.Link
                className={activeTab === "stock-request" ? "active" : ""}
                onClick={() => setActiveTab("stock-request")}
              >
                <FaClipboardCheck />{" "}
                {!isSidebarCollapsed && <span>Yêu cầu tồn kho</span>}
              </Nav.Link>
              {!isSidebarCollapsed &&
                (activeTab === "stock-request" ||
                  activeTab === "stock-request-create") && (
                  <Nav.Link
                    onClick={() => setActiveTab("stock-request-create")}
                    className={
                      activeTab === "stock-request-create"
                        ? "active sub-nav-link"
                        : "sub-nav-link"
                    }
                  >
                    <span>↳ Tạo yêu cầu mới</span>
                  </Nav.Link>
                )}
            </>
          )}
          {/* Stock Request Admin - chỉ dành cho SUPER_ADMIN */}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "stock-request-admin" ? "active" : ""}
              onClick={() => setActiveTab("stock-request-admin")}
            >
              <FaClipboardCheck />{" "}
              {!isSidebarCollapsed && <span>Quản lý yêu cầu tồn kho</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "transfer-receipt" ? "active" : ""}
              onClick={() => setActiveTab("transfer-receipt")}
            >
              <FaExchangeAlt />{" "}
              {!isSidebarCollapsed && <span>Phiếu chuyển kho</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "users" ? "active" : ""}
              onClick={() => setActiveTab("users")}
            >
              <FaUsers /> {!isSidebarCollapsed && <span>Người dùng</span>}
            </Nav.Link>
          )}
          <Nav.Link
            className={activeTab === "orders" ? "active" : ""}
            onClick={() => setActiveTab("orders")}
          >
            <FaShoppingCart /> {!isSidebarCollapsed && <span>Đơn hàng</span>}
          </Nav.Link>
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "banners" ? "active" : ""}
              onClick={() => setActiveTab("banners")}
            >
              <FaImages /> {!isSidebarCollapsed && <span>Banner</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "vouchers" ? "active" : ""}
              onClick={() => setActiveTab("vouchers")}
            >
              <FaTicketAlt /> {!isSidebarCollapsed && <span>Voucher</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "branch-manager" ? "active" : ""}
              onClick={() => setActiveTab("branch-manager")}
            >
              <FaBuilding /> {!isSidebarCollapsed && <span>Chi nhánh</span>}
            </Nav.Link>
          )}
          {isSuperAdmin &&
            !isSidebarCollapsed &&
            selectedBranchId &&
            activeTab === "branch-detail" && (
              <Nav.Link
                onClick={() => setActiveTab("branch-detail")}
                className="sub-nav-link active"
              >
                <span>↳ Chi tiết chi nhánh</span>
              </Nav.Link>
            )}
          {/* {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "roles" ? "active" : ""}
              onClick={() => setActiveTab("roles")}
            >
              <FaTicketAlt /> {!isSidebarCollapsed && <span>Role</span>}
            </Nav.Link>
          )} */}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "categorys" ? "active" : ""}
              onClick={() => setActiveTab("categorys")}
            >
              <FaTags /> {!isSidebarCollapsed && <span>Category</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "sizes" ? "active" : ""}
              onClick={() => setActiveTab("sizes")}
            >
              <FaRuler /> {!isSidebarCollapsed && <span>Size</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "admin-accounts" ? "active" : ""}
              onClick={() => setActiveTab("admin-accounts")}
            >
              <FaUserShield />{" "}
              {!isSidebarCollapsed && <span>Admin accounts</span>}
            </Nav.Link>
          )}
          {isSuperAdmin && (
            <Nav.Link
              className={activeTab === "chat" ? "active" : ""}
              onClick={() => setActiveTab("chat")}
            >
              <FaComments /> {!isSidebarCollapsed && <span>Chat hỗ trợ</span>}
            </Nav.Link>
          )}
          {/* <Nav.Link
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            <FaCog /> {!isSidebarCollapsed && <span>Cài đặt</span>}
          </Nav.Link> */}
        </Nav>
      </div>
    </div>
  );
};

export default AdminLeftNavbar;
