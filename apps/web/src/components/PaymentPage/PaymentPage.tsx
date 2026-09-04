// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
  ListGroup,
  Modal,
  Image,
} from "react-bootstrap";
import "./PaymentPage.scss";
import { useDispatch, useSelector } from "react-redux";
import { createOrderThunk, addOrderTemp } from "../../store/slices/orderSlice";
import { getPaymentMethods } from "../../services/paymentService";
import { toast } from "react-toastify";
import { getAllVouchers } from "../../services/voucherService";
import { io } from "socket.io-client";
import { BACKEND_WEBHOOK } from "../../config/constants";
import {
  getProvinces,
  getDistricts,
  getWards,
} from "../../services/addressService";
const PaymentPage = () => {
  const defaultCustomerInfo = {
    name: "",
    phone: "",
    email: "",
    address: "",
    message: "",
    paymentMethod: "cod",
    provinceId: "", // ProvinceID (number)
    districtId: "", // DistrictID (number)
    wardId: "", // WardCode (string)
  };

  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const { cartItems } = useSelector((state: any) => state.cart);
  const [customerInfo, setCustomerInfo] = useState(defaultCustomerInfo);
  const dispatch = useDispatch<any>();
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const orderIdRef = useRef(null);
  const socketRef = useRef(null);
  const calculateSubtotal = () => {
    return cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  };
  const [vouchers, setVouchers] = useState([]);
  const [currentVoucher, setCurrentVoucher] = useState({});
  const [discount, setDiscount] = useState(0);
  const shippingFee = 30000;
  const subtotal = calculateSubtotal();
  const total = subtotal + shippingFee - discount;

  // Thêm state cho modal
  const [showQRModal, setShowQRModal] = useState(false);
  const [orderId, setOrderId] = useState(null);
  useEffect(() => {
    const socket = io(BACKEND_WEBHOOK, {
      transports: ["websocket"],
      auth: { token: sessionStorage.getItem("token") },
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🟢 Connected to WebSocket server (socket.io)", socket.id);
      if (orderIdRef.current?.orderId) {
        socket.emit("joinPayment", orderIdRef.current.orderId);
      }
    });

    socket.on("payment-success", (data) => {
      // Lưu ý: sự kiện này phải giống sự kiện emit bên backend
      console.log("🟢 Payment success:", data);

      const isCurrentOrder =
        orderIdRef.current &&
        (data?.orderId === orderIdRef.current.orderId ||
          data?.orderId === String(orderIdRef.current.orderId));

      if (data?.status === "success" && isCurrentOrder) {
        setShowQRModal(false);
        toast.success("Thanh toán thành công!");

        setTimeout(() => {
          window.location.href = `/orders/user/${
            JSON.parse(sessionStorage.getItem("user")).userId
          }`;
        }, 2000);
      } else if (data?.status === "failed" && isCurrentOrder) {
        setShowQRModal(false);
        toast.error("Thanh toán thất bại, vui lòng thử lại!");
      }
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket.IO connection error:", err);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Disconnected from socket server");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
  useEffect(() => {
    fetchPaymentMethods();
    fetchAllVouchers();
  }, []);

  const fetchPaymentMethods = async () => {
    let response = await getPaymentMethods();
    if (response.data.EC === "0") {
      setPaymentMethods(response.data.DT);
    }
  };

  const fetchProvinces = async () => {
    try {
      const res = await getProvinces();
      if (+res?.data?.EC === 0) setProvinces(res.data.DT || []);
    } catch (error) {
      console.error("Get provinces failed:", error);
    }
  };

  const fetchDistricts = async (provinceId) => {
    if (!provinceId) return;
    try {
      const res = await getDistricts(provinceId);
      if (+res?.data?.EC === 0) setDistricts(res.data.DT || []);
      setWards([]); // reset wards when province changes
    } catch (error) {
      console.error("Get districts failed:", error);
    }
  };

  const fetchWards = async (districtId) => {
    if (!districtId) return;
    try {
      const res = await getWards(districtId);
      if (+res?.data?.EC === 0) setWards(res.data.DT || []);
    } catch (error) {
      console.error("Get wards failed:", error);
    }
  };

  const fetchAllVouchers = async () => {
    let response = await getAllVouchers();
    if (response.data.EC === "0") {
      setVouchers(response.data.DT);
    }
  };

  const handlePaymentMethodChange = (e) => {
    setPaymentMethod(e.target.value);
    setCustomerInfo({
      ...customerInfo,
      paymentMethod: e.target.value,
    });
  };

  useEffect(() => {
    fetchProvinces();
  }, []);

  const handleVoucherChange = (e) => {
    const selectedCode = e.target.value;
    const selectedVoucher = vouchers.find((v) => v.code === selectedCode);
    if (!selectedVoucher) {
      setDiscount(0);
      setCurrentVoucher({});
      return;
    }
    const discountType = selectedVoucher.discount_type;
    const discountValue = selectedVoucher.discount_value;
    if (discountType === "percent") {
      setDiscount((subtotal * discountValue) / 100);
    } else if (discountType === "fixed") {
      setDiscount(parseInt(discountValue));
    }

    setCurrentVoucher(selectedVoucher || {});
  };

  const handleProvinceChange = async (e) => {
    const provinceId = e.target.value;
    setCustomerInfo({
      ...customerInfo,
      provinceId,
      districtId: "",
      wardId: "",
    });
    setDistricts([]);
    setWards([]);
    await fetchDistricts(provinceId);
  };

  const handleDistrictChange = async (e) => {
    const districtId = e.target.value;
    setCustomerInfo({
      ...customerInfo,
      districtId,
      wardId: "",
    });
    setWards([]);
    await fetchWards(districtId);
  };

  const handleWardChange = (e) => {
    const wardId = e.target.value;
    setCustomerInfo({
      ...customerInfo,
      wardId,
    });
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (
      !customerInfo.provinceId ||
      !customerInfo.districtId ||
      !customerInfo.wardId
    ) {
      toast.error("Vui lòng chọn đầy đủ Tỉnh/Thành, Quận/Huyện, Phường/Xã");
      return;
    }

    let paymentMethodId = paymentMethods.find(
      (method) => method.name === paymentMethod
    )?.id;

    if (!paymentMethodId) {
      toast.error("Vui lòng chọn phương thức thanh toán!");
      return;
    }

    let orderData = {
      cartItems: cartItems,
      customerInfo: customerInfo,
      totalPrice: subtotal,
      paymentMethodId: paymentMethodId,
    };

    try {
      const result = await dispatch(createOrderThunk(orderData)).unwrap();
      if (!result) {
        toast.error("Lỗi khi tạo đơn hàng!");
        return;
      }

      let createdOrderId = result.DT;

      setOrderId(createdOrderId); // state (render UI)
      orderIdRef.current = createdOrderId;
      socketRef.current?.emit("joinPayment", createdOrderId.orderId);

      // ✅ Lưu tạm vào Redux
      dispatch(addOrderTemp(result));

      if (paymentMethod === "VIETTIN") {
        // Hiển thị modal QR code cho thanh toán VietinBank
        setShowQRModal(true);
      } else {
        // Thanh toán COD
        toast.success("Đơn hàng đã được đặt thành công!");

        // ✅ Chuyển hướng người dùng sau vài giây
        setTimeout(() => {
          window.location.href = `/orders/user/${
            JSON.parse(sessionStorage.getItem("user")).userId
          }`; // Chuyển hướng về trang Đơn hàng
        }, 2000);
      }
    } catch (error) {
      console.error("Lỗi khi tạo đơn hàng:", error);
      toast.error("Có lỗi xảy ra khi đặt hàng. Vui lòng thử lại!");
    }
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

  // Tạo URL QR code với thông tin thanh toán
  const generateQRUrl = () => {
    if (!orderId) return ""; // ⛔ chặn render khi chưa có orderId
    const accountNumber = "106882709225";
    const bank = "vietinbank";
    const amount = total;
    const addInfo = `ORDER_${orderIdRef.current.orderId}`; // ✅ ĐÚNG
    const accountName = "HappyShop";

    return `https://img.vietqr.io/image/${bank}-${accountNumber}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(
      addInfo
    )}&accountName=${encodeURIComponent(accountName)}`;
  };
  return (
    <>
      <Container className="payment-page py-5">
        <h2 className="text-center mb-4">Thanh Toán</h2>

        <Row>
          {/* Cột bên trái - Thông tin sản phẩm */}
          <Col lg={5} md={12}>
            <Card className="order-summary mb-4">
              <Card.Header>
                <h5 className="mb-0">Đơn hàng của bạn</h5>
              </Card.Header>
              <ListGroup variant="flush">
                {cartItems.map((item) => {
                  const images = getProductImages(item.images);

                  return (
                    <ListGroup.Item
                      key={item.id}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div className="d-flex align-items-center">
                        <img
                          src={images[0]?.url || ""}
                          alt={item.name}
                          className="product-thumbnail me-3"
                        />
                        <div>
                          <h6 className="mb-1 fw-semibold">{item.name}</h6>
                          <small className="text-white-50">
                            {item.quantity} x{" "}
                            {item.price.toLocaleString("vi-VN")}₫
                          </small>
                        </div>
                      </div>
                      <span className="fw-bold">
                        {(item.price * item.quantity).toLocaleString("vi-VN")}₫
                      </span>
                    </ListGroup.Item>
                  );
                })}
                <ListGroup.Item className="d-flex justify-content-between">
                  <span>Tạm tính:</span>
                  <span>{subtotal.toLocaleString("vi-VN")}₫</span>
                </ListGroup.Item>
                <ListGroup.Item className="d-flex justify-content-between">
                  <span>Phí vận chuyển:</span>
                  <span>{shippingFee.toLocaleString("vi-VN")}₫</span>
                </ListGroup.Item>
                {currentVoucher.id && (
                  <ListGroup.Item className="d-flex justify-content-between">
                    <span>Giảm giá:</span>
                    <span>-{discount.toLocaleString("vi-VN")}₫</span>
                  </ListGroup.Item>
                )}
                <ListGroup.Item className="d-flex justify-content-between">
                  <span>Tổng cộng:</span>
                  <span className="text-warning fw-bold fs-5">
                    {total.toLocaleString("vi-VN")}₫
                  </span>
                </ListGroup.Item>
              </ListGroup>
            </Card>
          </Col>

          {/* Cột bên phải - Form thông tin và phương thức thanh toán */}
          <Col lg={7} md={12}>
            <Card className="shipping-form mb-4">
              <Card.Header>
                <h5 className="mb-0">Thông tin giao hàng</h5>
              </Card.Header>
              <Card.Body>
                <Form onSubmit={handlePayment}>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Họ và tên <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="text"
                          required
                          placeholder="Nhập họ và tên"
                          onChange={(e) =>
                            setCustomerInfo({
                              ...customerInfo,
                              name: e.target.value,
                            })
                          }
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Số điện thoại <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="tel"
                          required
                          placeholder="Nhập số điện thoại"
                          onChange={(e) =>
                            setCustomerInfo({
                              ...customerInfo,
                              phone: e.target.value,
                            })
                          }
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3">
                    <Form.Label>
                      Email <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="email"
                      required
                      placeholder="Nhập địa chỉ email"
                      onChange={(e) =>
                        setCustomerInfo({
                          ...customerInfo,
                          email: e.target.value,
                        })
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>
                      Địa chỉ <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      required
                      placeholder="Nhập địa chỉ nhận hàng"
                      onChange={(e) =>
                        setCustomerInfo({
                          ...customerInfo,
                          address: e.target.value,
                        })
                      }
                    />
                  </Form.Group>

                  <Row>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Tỉnh/Thành phố <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={customerInfo.provinceId}
                          required
                          onChange={handleProvinceChange}
                        >
                          <option value="">Chọn tỉnh/thành</option>
                          {provinces.map((province) => {
                            return (
                              <option
                                key={province.ProvinceID}
                                value={province.ProvinceID}
                              >
                                {province.ProvinceName}
                              </option>
                            );
                          })}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Quận/Huyện <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={customerInfo.districtId}
                          required
                          onChange={handleDistrictChange}
                          disabled={!customerInfo.provinceId}
                        >
                          <option value="">Chọn quận/huyện</option>
                          {districts.map((district) => (
                            <option
                              key={district.DistrictID}
                              value={district.DistrictID}
                            >
                              {district.DistrictName}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          Phường/Xã <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={customerInfo.wardId}
                          required
                          onChange={handleWardChange}
                          disabled={!customerInfo.districtId}
                        >
                          <option value="">Chọn phường/xã</option>
                          {wards.map((ward) => (
                            <option key={ward.WardCode} value={ward.WardCode}>
                              {ward.WardName}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-3">
                    <Form.Label>Ghi chú</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      placeholder="Nhập ghi chú nếu cần"
                      onChange={(e) =>
                        setCustomerInfo({
                          ...customerInfo,
                          message: e.target.value,
                        })
                      }
                    />
                  </Form.Group>
                  <Card className="voucher-section mb-4">
                    <Card.Header>
                      <h5 className="mb-0">Mã giảm giá</h5>
                    </Card.Header>
                    <Card.Body>
                      <Form.Group controlId="voucherSelect">
                        <Form.Label className="text-white">
                          Chọn mã giảm giá của bạn
                        </Form.Label>
                        <Form.Select
                          value={currentVoucher?.code || ""}
                          onChange={(e) => handleVoucherChange(e)}
                        >
                          <option value="">-- Chọn mã giảm giá --</option>
                          {vouchers.map((voucher) => (
                            <option key={voucher.id} value={voucher.code}>
                              {voucher.code}
                            </option>
                          ))}
                        </Form.Select>
                        {currentVoucher?.description && (
                          <p className="voucher-description mb-0 mt-2">
                            {currentVoucher.description}
                          </p>
                        )}
                      </Form.Group>
                    </Card.Body>
                  </Card>

                  <Card className="mb-4">
                    <Card.Header>
                      <h5 className="mb-0">Phương thức thanh toán</h5>
                    </Card.Header>
                    <Card.Body>
                      <Form.Group>
                        <div className="payment-methods">
                          {paymentMethods
                            .filter((method) => method.name !== "VNPAY") // Loại bỏ VNPAY
                            .map((method) => {
                              const isSelected = paymentMethod === method.name;

                              const getTitle = (methodName) => {
                                switch (methodName) {
                                  case "COD":
                                    return "Thanh toán khi nhận hàng";
                                  case "VIETTIN":
                                    return "Ví điện tử VietinBank";
                                  default:
                                    return method.description;
                                }
                              };

                              const getDescription = (methodName) => {
                                switch (methodName) {
                                  case "COD":
                                    return "Thanh toán bằng tiền mặt khi nhận hàng";
                                  case "VIETTIN":
                                    return "Quét QR code để thanh toán nhanh chóng";
                                  default:
                                    return "Phương thức thanh toán tiện lợi";
                                }
                              };

                              return (
                                <div
                                  className={`payment-method-item ${
                                    isSelected ? "active" : ""
                                  }`}
                                  key={method.id}
                                  onClick={() => setPaymentMethod(method.name)}
                                >
                                  <input
                                    className="form-check-input"
                                    type="radio"
                                    name="paymentMethod"
                                    id={method.id}
                                    value={method.name}
                                    checked={isSelected}
                                    onChange={handlePaymentMethodChange}
                                  />
                                  <label
                                    className="form-check-label"
                                    htmlFor={method.id}
                                  >
                                    <div className="payment-details">
                                      <div className="payment-title">
                                        {getTitle(method.name)}
                                      </div>
                                      <div className="payment-description">
                                        {getDescription(method.name)}
                                      </div>
                                    </div>
                                  </label>
                                </div>
                              );
                            })}
                        </div>
                      </Form.Group>
                    </Card.Body>
                  </Card>

                  <div className="d-grid gap-2">
                    <Button variant="primary" size="lg" type="submit">
                      Đặt hàng
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Modal QR code thanh toán VietinBank */}
      <Modal
        show={showQRModal}
        onHide={() => setShowQRModal(false)}
        centered
        size="lg"
        className="payment-modal"
      >
        <Modal.Header closeButton className="bg-gradient border-0">
          <Modal.Title className="text-white">
            Thanh toán qua VietinBank
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center p-4">
          <div className="mb-4">
            <h4 className="text-primary mb-3">Quét mã QR để thanh toán</h4>
            <div className="bg-light rounded-3 p-3 d-inline-block">
              <div className="text-muted mb-2">Số tiền thanh toán</div>
              <div className="h3 text-success fw-bold">
                {total.toLocaleString("vi-VN")}₫
              </div>
            </div>
          </div>

          <div className="qr-container mb-4 d-flex justify-content-center align-items-center">
            <Image
              src={generateQRUrl()}
              alt="QR Code thanh toán VietinBank"
              fluid
              className="qr-image"
              style={{ maxWidth: "300px" }}
            />
          </div>

          <div className="payment-instructions">
            <h6 className="text-muted mb-3">Hướng dẫn thanh toán:</h6>
            <div className="row g-3">
              <div className="col-6">
                <div className="instruction-step">
                  <div className="step-number">1</div>
                  <small>Mở app VietinBank</small>
                </div>
              </div>
              <div className="col-6">
                <div className="instruction-step">
                  <div className="step-number">2</div>
                  <small>Quét mã QR</small>
                </div>
              </div>
              <div className="col-6">
                <div className="instruction-step">
                  <div className="step-number">3</div>
                  <small>Xác nhận thanh toán</small>
                </div>
              </div>
              <div className="col-6">
                <div className="instruction-step">
                  <div className="step-number">4</div>
                  <small>Hoàn tất đơn hàng</small>
                </div>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 bg-light">
          <Button
            variant="outline-secondary"
            onClick={() => setShowQRModal(false)}
            className="px-4"
          >
            Hủy thanh toán
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PaymentPage;
