import { Routes, Route } from "react-router-dom";
import Login from "../components/Login/Login";
import Register from "../components/Register/Register";
import Products from "../components/ManageProducts/Products";
import Home from "../components/Home/Home";
import ProductsPage from "../components/ProductsPage/ProductsPage";
import ProductDetails from "../components/ProductDetails/ProductDetails";
import PrivateRoutes from "./PrivateRoutes";
import Cart from "../components/Cart/Cart";
import MainLayout from "../layouts/MainLayout";
import AuthLayout from "../layouts/AuthLayout";
import AdminLayout from "../layouts/AdminLayout";
import AdminPage from "../pages/AdminPage/AdminPage";
import PaymentPage from "../components/PaymentPage/PaymentPage";
import PaymentStatus from "../components/PaymentStatusPage/PaymentStatus";
import OrdersPage from "../components/OrdersPage/OrdersPage";
import OrderDetailsPage from "../components/OrderDetailsPage/OrderDetailsPage";
import AccountPage from "../pages/AccountPage/AccountPage";
import AdminLoginPage from "../pages/AdminLoginPage/AdminLoginPage";
const AppRoutes = () => {
  return (
    <>
      <Routes>
        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <AdminLayout allowedRoles={["SUPER_ADMIN", "BRANCH_MANAGER"]}>
              <AdminPage />
            </AdminLayout>
          }
        />
        <Route
          path="/admin/login"
          element={
            <AuthLayout>
              <AdminLoginPage />
            </AuthLayout>
          }
        />
        <Route
          path="/admin/products"
          element={
            <AdminLayout>
              <Products />
            </AdminLayout>
          }
        />
        <Route
          path="/admin/stock-request"
          element={
            <AdminLayout>
              <AdminPage />
            </AdminLayout>
          }
        />

        {/* User Routes */}
        <Route
          path="/products"
          element={
            <MainLayout>
              <ProductsPage />
            </MainLayout>
          }
        />
        <Route
          path="/about"
          element={
            <MainLayout>
              <div>about</div>
            </MainLayout>
          }
        />
        <Route
          path="/contact"
          element={
            <MainLayout>
              <div>contact</div>
            </MainLayout>
          }
        />
        <Route
          path="/payment"
          element={
            <MainLayout>
              <PaymentPage />
            </MainLayout>
          }
        />
        <Route
          path="/login"
          element={
            <AuthLayout>
              <Login />
            </AuthLayout>
          }
        />
        <Route
          path="/register"
          element={
            <AuthLayout>
              <Register />
            </AuthLayout>
          }
        />

        <Route
          path="/"
          element={
            <MainLayout>
              <Home />
            </MainLayout>
          }
        />
        <Route
          path="/product/:id"
          element={
            <MainLayout>
              <ProductDetails />
            </MainLayout>
          }
        />
        <Route element={<PrivateRoutes />}>
          <Route
            path="/cart"
            element={
              <MainLayout>
                <Cart />
              </MainLayout>
            }
          />
          <Route
            path="/orders/user/:userId"
            element={
              <MainLayout>
                <OrdersPage />
              </MainLayout>
            }
          />
          <Route
            path="/orders/details/:orderId"
            element={
              <MainLayout>
                <OrderDetailsPage />
              </MainLayout>
            }
          />
          <Route path="/payment-status" element={<PaymentStatus />} />
          <Route
            path="/user-account/:userId"
            element={
              <MainLayout>
                <AccountPage />
              </MainLayout>
            }
          />
        </Route>

        <Route path="*" element={<div>404 not found</div>} />
      </Routes>
    </>
  );
};

export default AppRoutes;
