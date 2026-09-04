// @ts-nocheck
import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Navbar,
  Nav,
  Container,
  Button,
  Badge,
  Form,
  InputGroup,
} from "react-bootstrap";
import "./Nav.scss";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { logoutUser } from "../../services/userService";
import { useSelector, useDispatch } from "react-redux";
import { fetchCart } from "../../store/slices/cartSlice";

const Navigation = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<any>();
  const cartItems = useSelector((state: any) => state.cart.cartItems);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const userId = JSON.parse(sessionStorage.getItem("user"))?.userId;
  const user = JSON.parse(sessionStorage.getItem("user"));
  const isAdmin =
    Array.isArray(user?.userRole) && user.userRole[0]?.name === "admin";
  useEffect(() => {
    // Lấy giỏ hàng khi component Navigation mount lần đầu
    dispatch(fetchCart());
    // console.log(isAdmin);
  }, [dispatch]);

  useEffect(() => {
    const closeDropdown = (e) => {
      if (!e.target.closest(".user-dropdown")) {
        setIsDropdownOpen(false);
      }
    };

    const closeSearch = (e) => {
      if (!e.target.closest(".search-container")) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("click", closeDropdown);
    document.addEventListener("click", closeSearch);
    return () => {
      document.removeEventListener("click", closeDropdown);
      document.removeEventListener("click", closeSearch);
    };
  }, []);

  const handleLogout = async () => {
    try {
      let response = await logoutUser();
      console.log("check res", response);
      if (response.status === 200) {
        sessionStorage.clear();
      }
    } catch (error) {
      console.error("Lỗi khi đăng xuất:", error);
    }
  };

  const handleAdminClick = () => {
    navigate("/admin"); // Đường dẫn đến trang admin
  };

  const toggleDropdown = (e) => {
    e.preventDefault();
    setIsDropdownOpen(!isDropdownOpen);
  };

  const toggleSearch = (e) => {
    e.preventDefault();
    setIsSearchOpen(!isSearchOpen);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <>
      <Navbar bg="light" expand="lg" className="border-bottom px-4 py-3">
        <Container>
          <Navbar.Brand className="fw-bold fs-3" as={NavLink} to="/">
            HappyShop
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="navbarNav" />
          <Navbar.Collapse id="navbarNav">
            <Nav className="ms-auto">
              <NavLink to="/" className="nav-link">
                Trang chủ
              </NavLink>
              <NavLink to="/products" className="nav-link">
                Sản phẩm
              </NavLink>

              {isAdmin && (
                <Button
                  variant="outline-dark"
                  className="rounded-pill ms-3"
                  onClick={handleAdminClick}
                >
                  Quản lý
                </Button>
              )}
            </Nav>
            <div className="ms-3 d-flex align-items-center">
              <div className="search-container">
                <NavLink
                  to="#"
                  className={`nav-link text-dark mx-3 search-icon ${
                    isSearchOpen ? "active" : ""
                  }`}
                  onClick={toggleSearch}
                >
                  <i className="fa-solid fa-magnifying-glass"></i>
                </NavLink>
                <div
                  className={`search-dropdown ${isSearchOpen ? "show" : ""}`}
                >
                  <Form onSubmit={handleSearch} className="search-form">
                    <InputGroup className="search-input-group">
                      <Form.Control
                        type="text"
                        placeholder="Tìm kiếm sản phẩm..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                        className="search-input"
                      />
                      <Button
                        variant="primary"
                        type="submit"
                        className="search-submit-btn"
                      >
                        <i className="fa-solid fa-magnifying-glass"></i>
                      </Button>
                    </InputGroup>
                  </Form>
                </div>
              </div>
              <div className="user-dropdown">
                <NavLink
                  to="#"
                  className="nav-link text-dark mx-3"
                  onClick={toggleDropdown}
                >
                  <i className="fa-solid fa-user"></i>
                </NavLink>
                <div
                  className={`dropdown-menu ${isDropdownOpen ? "show" : ""}`}
                >
                  {userId ? (
                    <>
                      <NavLink
                        to={`/user-account/${userId}`}
                        className="dropdown-item"
                      >
                        <i className="fa-solid fa-user-circle me-2"></i>
                        Tài khoản
                      </NavLink>
                      <NavLink
                        to={`/orders/user/${userId}`}
                        className="dropdown-item"
                      >
                        <i className="fa-solid fa-clipboard-list me-2"></i>
                        Đơn hàng
                      </NavLink>
                      <div className="dropdown-divider"></div>
                      <NavLink
                        to="/login"
                        className="dropdown-item text-danger"
                        onClick={handleLogout}
                      >
                        <i className="fa-solid fa-sign-out-alt me-2"></i>
                        Đăng xuất
                      </NavLink>
                    </>
                  ) : (
                    <>
                      <NavLink to="/login" className="dropdown-item">
                        <i className="fa-solid fa-sign-in-alt me-2"></i>
                        Đăng nhập
                      </NavLink>
                      <NavLink to="/register" className="dropdown-item">
                        <i className="fa-solid fa-user-plus me-2"></i>
                        Đăng ký
                      </NavLink>
                    </>
                  )}
                </div>
              </div>
              <NavLink
                to="/cart"
                className="nav-link text-dark position-relative mx-3"
              >
                <i className="fa-solid fa-bag-shopping"></i>
                <Badge
                  bg="danger"
                  className="position-absolute top-0 start-100 translate-middle"
                >
                  {cartItems.length}
                </Badge>
              </NavLink>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </>
  );
};

export default Navigation;
