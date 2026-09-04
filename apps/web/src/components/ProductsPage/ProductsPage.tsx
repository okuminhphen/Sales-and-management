// @ts-nocheck
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  InputGroup,
  ListGroup,
} from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import { fetchProducts } from "../../store/slices/productSlice";
import "bootstrap/dist/css/bootstrap.min.css";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchCategory } from "../../services/productService";
import { BACKEND_URL } from "../../config/constants";
import "./ProductsPage.scss";
import { FaSearch, FaThLarge } from "react-icons/fa";

const ProductList = () => {
  const dispatch = useDispatch<any>();
  const location = useLocation();
  const { products, status } = useSelector((state: any) => state.product);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  // Lấy search parameter từ URL
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const searchQuery = queryParams.get("search");
    if (searchQuery) {
      setSearchTerm(searchQuery);
    }
  }, [location.search]);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchProducts());
    }
  }, [status, dispatch]);

  useEffect(() => {
    getCategories();
  }, []);

  const getCategories = async () => {
    try {
      let response = await fetchCategory();
      setCategories(response.data.DT);
    } catch (error) {
      console.error("Lỗi khi lấy categories:", error);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(`/products?search=${encodeURIComponent(searchTerm.trim())}`);
  };

  const handleCategoryClick = (categoryId) => {
    setSelectedCategory(categoryId === selectedCategory ? "" : categoryId);
  };

  // Lọc sản phẩm theo category và search term
  const filteredProducts = products
    .filter(
      (product) =>
        !selectedCategory ||
        Number(product.Category?.id) === Number(selectedCategory)
    )
    .filter(
      (product) =>
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const getProductImages = (images) => {
    if (!images) return [];
    let parsedImages = [];

    try {
      parsedImages = JSON.parse(images);
      if (typeof parsedImages === "string") {
        parsedImages = JSON.parse(parsedImages);
      }
    } catch (error) {
      console.error("Lỗi parse JSON:", error);
      return [];
    }

    if (!Array.isArray(parsedImages)) return [];

    return parsedImages
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") {
          return {
            url: item.startsWith("http") ? item : `${BACKEND_URL}${item}`,
          };
        }
        if (item.url) {
          return {
            url: item.url.startsWith("http")
              ? item.url
              : `${BACKEND_URL}${item.url}`,
          };
        }
        return null;
      })
      .filter(Boolean);
  };

  return (
    <div className="products-page">
      <Container fluid className="custom-container py-4">
        <Row>
          {/* Sidebar Categories */}
          <Col lg={3} md={4} className="mb-4">
            <Card className="category-sidebar h-100">
              <Card.Header className="category-header">
                <FaThLarge className="me-2" />
                <strong>Danh mục sản phẩm</strong>
              </Card.Header>
              <Card.Body className="p-0">
                <ListGroup variant="flush">
                  <ListGroup.Item
                    action
                    active={!selectedCategory}
                    onClick={() => handleCategoryClick("")}
                    className="category-item"
                  >
                    <span>Tất cả sản phẩm</span>
                    <span className="badge bg-secondary rounded-pill ms-auto">
                      {products.length}
                    </span>
                  </ListGroup.Item>
                  {categories.map((category) => {
                    const categoryProductCount = products.filter(
                      (p) => Number(p.Category?.id) === Number(category.id)
                    ).length;
                    return (
                      <ListGroup.Item
                        key={category.id}
                        action
                        active={
                          Number(selectedCategory) === Number(category.id)
                        }
                        onClick={() => handleCategoryClick(category.id)}
                        className="category-item"
                      >
                        <span>{category.name}</span>
                        <span className="badge bg-secondary rounded-pill ms-auto">
                          {categoryProductCount}
                        </span>
                      </ListGroup.Item>
                    );
                  })}
                </ListGroup>
              </Card.Body>
            </Card>
          </Col>

          {/* Main Content */}
          <Col lg={9} md={8}>
            <div className="products-content">
              <div className="page-header mb-4">
                <h1 className="page-title">TẤT CẢ SẢN PHẨM</h1>
                <p className="results-count">
                  Có <strong>{filteredProducts.length}</strong> sản phẩm
                  {selectedCategory &&
                    ` trong danh mục "${
                      categories.find(
                        (c) => Number(c.id) === Number(selectedCategory)
                      )?.name || ""
                    }"`}
                </p>
              </div>

              <div className="search-filter-section mb-4">
                <Form onSubmit={handleSearch}>
                  <InputGroup>
                    <Form.Control
                      type="text"
                      placeholder="Tìm kiếm sản phẩm..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      className="search-input"
                    />
                    <Button
                      variant="dark"
                      type="submit"
                      className="search-button"
                    >
                      <FaSearch />
                    </Button>
                  </InputGroup>
                </Form>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="no-products">
                  <div className="no-products-icon">📦</div>
                  <h3>Không tìm thấy sản phẩm phù hợp</h3>
                  <p>
                    Vui lòng thử lại với từ khóa khác hoặc chọn danh mục khác
                  </p>
                </div>
              ) : (
                <Row className="g-4">
                  {filteredProducts.map((product) => {
                    const images = getProductImages(product.images);
                    return (
                      <Col key={product.id} xl={3} lg={4} md={6} sm={6} xs={12}>
                        <Card
                          className="product-card"
                          onClick={() => navigate(`/product/${product.id}`)}
                        >
                          <div className="card-img-wrapper">
                            <img
                              src={images[0]?.url || ""}
                              alt={product.name}
                              className="card-img"
                              onError={(e) => {
                                e.target.src =
                                  "https://via.placeholder.com/300x300?text=No+Image";
                              }}
                            />
                            {product.Category && (
                              <div className="category-badge">
                                {product.Category.name}
                              </div>
                            )}
                          </div>
                          <Card.Body>
                            <Card.Title className="card-title">
                              {product.name}
                            </Card.Title>
                            <Card.Text className="card-price">
                              {product.price.toLocaleString("vi-VN")} VND
                            </Card.Text>
                          </Card.Body>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              )}
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default ProductList;
