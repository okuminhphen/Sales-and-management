// @ts-nocheck
import { useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Badge,
  Alert,
  InputGroup,
} from "react-bootstrap";
import {
  FaTrash,
  FaShoppingCart,
  FaCreditCard,
  FaMinus,
  FaPlus,
} from "react-icons/fa";
import {
  fetchCart,
  updateCartItemQuantityAsync,
  removeCartItemAsync,
} from "../../store/slices/cartSlice";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

const Cart = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<any>();
  const { cartItems, totalPrice, error } = useSelector((state: any) => state.cart);

  useEffect(() => {
    // Lấy giỏ hàng từ API khi component được render
    dispatch(fetchCart());
  }, [dispatch]);

  const handleUpdateQuantity = (cartProductSizeId, quantity) => {
    dispatch(
      updateCartItemQuantityAsync({
        cartProductSizeId,
        quantity: quantity,
      })
    );
  };
  const handleIncreaseQuantity = (item) => {
    handleUpdateQuantity(item.id, item.quantity + 1);
  };

  const handleDecreaseQuantity = (item) => {
    if (item.quantity > 1) {
      handleUpdateQuantity(item.id, item.quantity - 1);
    }
  };
  const handleRemoveItem = (cartProductSizeId) => {
    dispatch(removeCartItemAsync(cartProductSizeId));
  };

  const getProductImages = (images) => {
    if (!images) return [];

    let parsed = images;

    try {
      // parse nhiều lần nếu cần
      while (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
    } catch (e) {
      console.error("Parse images error:", e);
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((img) => {
        if (typeof img === "string") return { url: img };
        if (img?.url) return { url: img.url };
        return null;
      })
      .filter(Boolean);
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  };

  return (
    <Container className="py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="m-0">
          <FaShoppingCart className="me-2" /> Giỏ hàng của bạn
        </h2>
        <Badge bg="info" pill className="fs-6">
          {cartItems.length} sản phẩm
        </Badge>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {cartItems.length === 0 ? (
        <Card className="text-center p-5 shadow-sm">
          <Card.Body>
            <Card.Title className="mb-3">Giỏ hàng trống</Card.Title>
            <Card.Text>
              Hãy thêm sản phẩm vào giỏ hàng để tiếp tục mua sắm.
            </Card.Text>
            <Button variant="primary" href="/products">
              Tiếp tục mua sắm
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <>
          <Row className="gy-4">
            {cartItems.map((item, index) => {
              const images = getProductImages(item.images);

              return (
                <Col xs={12} key={item.id || `cart-item-${index}`}>
                  <Card className="shadow-sm border-0 h-100">
                    <Card.Body>
                      <Row className="align-items-center">
                        <Col
                          xs={12}
                          md={2}
                          className="text-center mb-3 mb-md-0"
                        >
                          <img
                            src={images[0]?.url || ""}
                            alt={item.name}
                            className="img-fluid rounded"
                            style={{
                              maxHeight: "120px",
                              objectFit: "cover",
                              borderRadius: "10px",
                              boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                            }}
                          />
                        </Col>

                        <Col xs={12} md={3} className="mb-3 mb-md-0">
                          <h5 className="fw-bold">{item.name}</h5>
                          <div className="text-muted">
                            <small>Mã sản phẩm: #{item.id}</small>
                            {item.size && <div>Size: {item.size}</div>}
                          </div>
                        </Col>

                        <Col xs={6} md={2} className="text-md-center">
                          <div className="text-muted small">Đơn giá</div>
                          <div className="fw-bold text-primary">
                            {formatPrice(item.price)}
                          </div>
                        </Col>

                        <Col xs={6} md={2} className="text-md-center">
                          <div className="text-muted small mb-2">Số lượng</div>
                          <div className="d-flex justify-content-center align-items-center">
                            <InputGroup style={{ maxWidth: "140px" }}>
                              <Button
                                variant="outline-secondary"
                                onClick={() => handleDecreaseQuantity(item)}
                                disabled={item.quantity <= 1}
                                className="d-flex align-items-center justify-content-center"
                                style={{ width: "40px" }}
                              >
                                <FaMinus size={12} />
                              </Button>

                              <Form.Control
                                type="number"
                                value={item.quantity}
                                min="1"
                                onChange={(e) => {
                                  const value = parseInt(e.target.value);
                                  if (value > 0) {
                                    handleUpdateQuantity(item.id, value); // Đảm bảo item.id đúng
                                  }
                                }}
                                onBlur={(e) => {
                                  const value = parseInt(e.target.value);
                                  if (value > 0) {
                                    handleUpdateQuantity(item.id, value);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const value = parseInt(e.target.value);
                                    if (value > 0) {
                                      handleUpdateQuantity(item.id, value);
                                    }
                                  }
                                }}
                                className="text-center"
                                style={{ flex: "0 0 60px" }}
                              />
                              <Button
                                variant="outline-secondary"
                                onClick={() => handleIncreaseQuantity(item)}
                                className="d-flex align-items-center justify-content-center"
                                style={{ width: "40px" }}
                              >
                                <FaPlus size={12} />
                              </Button>
                            </InputGroup>
                          </div>
                        </Col>

                        <Col
                          xs={6}
                          md={2}
                          className="mt-3 mt-md-0 text-md-center"
                        >
                          <div className="text-muted small">Thành tiền</div>
                          <div className="fw-bold fs-5 text-success">
                            {formatPrice(item.price * item.quantity)}
                          </div>
                        </Col>

                        <Col xs={6} md={1} className="mt-3 mt-md-0 text-end">
                          <Button
                            variant="outline-danger"
                            onClick={() => handleRemoveItem(item.id)}
                            className="rounded-circle p-2"
                          >
                            <FaTrash />
                          </Button>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>

          <Card className="mt-4 shadow-sm border-0">
            <Card.Body>
              <Row className="align-items-center">
                <Col xs={12} md={6}>
                  <Button
                    variant="outline-secondary"
                    href="/products"
                    className="me-2"
                  >
                    Tiếp tục mua sắm
                  </Button>
                </Col>

                <Col xs={12} md={6} className="text-md-end mt-3 mt-md-0">
                  <div className="d-flex flex-column align-items-end">
                    <div className="mb-2">
                      <span className="me-2">Tổng tiền:</span>
                      <span className="fs-4 fw-bold text-danger">
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                    <Button
                      variant="success"
                      size="lg"
                      disabled={cartItems.length === 0}
                      className="px-4"
                      onClick={() => {
                        navigate("/payment");
                      }}
                    >
                      <FaCreditCard className="me-2" /> Thanh toán
                    </Button>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </>
      )}
    </Container>
  );
};

export default Cart;
