import { Navbar, Dropdown, Button } from "react-bootstrap";
import { FaBars, FaSun, FaMoon, FaUser, FaSignOutAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { logoutAdmin } from "../../store/slices/adminSlice";
import { useAppDispatch } from "../../store/hooks";
import type { AdminSession } from "../../types/auth";
import "./AdminTopNavbar.scss";

interface AdminTopNavbarProps {
  adminInfo: AdminSession | null;
  isSidebarCollapsed?: boolean;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

const AdminTopNavbar = ({
  adminInfo,
  isSidebarCollapsed,
  onToggleSidebar,
  onToggleTheme,
  theme,
}: AdminTopNavbarProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleLogout = () => {
    dispatch(logoutAdmin());
    navigate("/admin/login");
  };

  const handleHome = () => {
    navigate("/");
  };

  return (
    <Navbar className="admin-top-navbar" expand="lg">
      <div className="navbar-left">
        <Button
          variant="link"
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
        >
          <FaBars />
        </Button>
      </div>

      <div className="navbar-right">
        <div className="navbar-actions">
          {/* Theme Toggle */}
          <Button
            variant="link"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={
              theme === "light"
                ? "Chuyển sang chế độ tối"
                : "Chuyển sang chế độ sáng"
            }
          >
            {theme === "light" ? <FaMoon /> : <FaSun />}
          </Button>

          {/* Notification
          <Notification adminInfo={adminInfo} /> */}

          {/* User Dropdown */}
          <Dropdown align="end" className="user-dropdown">
            <Dropdown.Toggle variant="link" className="user-toggle-btn">
              <div className="user-info">
                <div className="user-avatar">
                  <FaUser />
                </div>
                <div className="user-details">
                  <div className="user-name">
                    {adminInfo?.username || adminInfo?.email || "Admin"}
                  </div>
                  <div className="user-role">
                    {adminInfo?.role === "SUPER_ADMIN"
                      ? "Quản trị viên"
                      : "Quản lý chi nhánh"}
                  </div>
                </div>
              </div>
            </Dropdown.Toggle>

            <Dropdown.Menu className="user-dropdown-menu">
              <Dropdown.Item onClick={handleHome}>
                <FaUser className="me-2" />
                Về trang chủ
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={handleLogout} className="logout-item">
                <FaSignOutAlt className="me-2" />
                Đăng xuất
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>
    </Navbar>
  );
};

export default AdminTopNavbar;
