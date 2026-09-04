import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "../store/hooks";

interface AdminLayoutProps {
  children: ReactNode;
  allowedRoles?: string[];
}

const AdminLayout = ({ children, allowedRoles = [] }: AdminLayoutProps) => {
  const location = useLocation();
  const { isAuthenticated, adminInfo } = useAppSelector((state) => state.admin);

  // chưa login
  if (!isAuthenticated || !adminInfo) {
    return (
      <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
    );
  }

  // check role
  if (allowedRoles.length > 0 && !allowedRoles.includes(adminInfo.role)) {
    return <Navigate to="/" replace />; // hoặc trang 403
  }

  return <>{children}</>;
};

export default AdminLayout;
