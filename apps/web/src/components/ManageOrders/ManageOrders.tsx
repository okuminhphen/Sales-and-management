// @ts-nocheck
import React, { useEffect, useState, useMemo } from "react";
import {
  Container,
  Table,
  Badge,
  Button,
  Tabs,
  Tab,
  Modal,
  Form,
  Spinner,
  Row,
  Col,
  ListGroup,
  Card,
} from "react-bootstrap";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchOrdersThunk,
  updateAdminOrderStatusThunk,
  deleteAdminOrderThunk,
  createOrderAtBranchThunk,
} from "../../store/slices/orderSlice";
import { fetchInventoryByBranch } from "../../store/slices/inventorySlice";
import { toast } from "react-toastify";
import {
  FaPlus,
  FaMinus,
  FaTimes,
  FaSync,
  FaEye,
  FaEdit,
  FaTrash,
} from "react-icons/fa";
import { BACKEND_URL } from "../../config/constants";
import "./ManageOrders.scss";

const ManageOrders = () => {
  const [activeTab, setActiveTab] = useState("ALL");
  const dispatch = useDispatch<any>();
  const adminInfo = useSelector((state: any) => state.admin.adminInfo);

  // State cho modal chi tiết đơn hàng
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);

  // State cho modal sửa trạng thái
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newStatus, setNewStatus] = useState("");

  // State cho modal xóa đơn hàng
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);

  // 1. State quản lý modal thêm đơn hàng và dữ liệu form
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOrderData, setNewOrderData] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    shippingAddress: "",
  });
  const [cartItems, setCartItems] = useState([
    { productSizeId: "", quantity: 1 },
  ]);

  const { orders = [], status, error } = useSelector((state: any) => state.orders);
  const { items: inventoryItems } = useSelector((state: any) => state.inventory);
  const loading = status === "loading";
  console.log(orders);
  const refreshData = () => {
    if (!adminInfo) return;

    dispatch(
      fetchOrdersThunk({
        role: adminInfo?.role,
        branchId:
          adminInfo?.role === "SUPER_ADMIN" ? null : adminInfo?.branchId, // branch của admin
      })
    );
  };

  useEffect(() => {
    refreshData(); // Lấy tất cả đơn hàng khi component được mount
    // Lấy inventory khi mở modal
    if (showAddModal && adminInfo?.branchId) {
      dispatch(fetchInventoryByBranch(String(adminInfo.branchId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, showAddModal, adminInfo?.branchId]);

  // Parse images helper
  const parseImages = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) return images;
    try {
      let parsed = JSON.parse(images);
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (typeof images === "string" && images.includes(",")) {
        return images.split(",").map((item) => item.trim());
      }
      return [];
    }
  };

  // Get image URL helper
  const getImageUrl = (image) => {
    if (!image) return "";
    if (typeof image === "object" && image.url) return image.url;
    if (typeof image === "string") {
      if (image.startsWith("http")) return image;
      return `${BACKEND_URL}${image}`;
    }
    return "";
  };

  // Get product sizes from inventory
  const productSizes = useMemo(() => {
    if (!inventoryItems || !Array.isArray(inventoryItems)) return [];

    const sizes = [];
    inventoryItems.forEach((product) => {
      if (product.sizes && Array.isArray(product.sizes)) {
        product.sizes.forEach((size) => {
          if (size.productSizeId || size.id) {
            const images = parseImages(product.images);
            sizes.push({
              id: size.productSizeId || size.id,
              productId: product.id,
              productName: product.name,
              productImages: images,
              productPrice: product.price,
              sizeId: size.sizeId,
              sizeName: size.sizeName || size.name || size.size?.name || "N/A",
              stock: size.stock || size.inventories?.[0]?.stock || 0,
            });
          }
        });
      }
    });
    return sizes;
  }, [inventoryItems]);

  // Get selected product info
  const getSelectedProductInfo = (productSizeId) => {
    return productSizes.find((ps) => ps.id === Number(productSizeId));
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      PENDING: { variant: "warning", text: "Chờ xác nhận" },
      CONFIRMED: { variant: "info", text: "Đã xác nhận" },
      SHIPPING: { variant: "primary", text: "Đang giao" },
      COMPLETED: { variant: "success", text: "Đã giao" },
      CANCELLED: { variant: "danger", text: "Đã hủy" },
    };

    const config = statusConfig[status] || {
      variant: "secondary",
      text: "Không xác định",
    };
    return <Badge bg={config.variant}>{config.text}</Badge>;
  };

  const getPaymentStatusBadge = (status) => {
    const statusConfig = {
      PENDING: { variant: "warning", text: "Chờ thanh toán" },
      PAID: { variant: "success", text: "Đã thanh toán" }, // legacy
      COMPLETED: { variant: "success", text: "Đã thanh toán" }, // mới cho QR/VNPAY
      FAILED: { variant: "danger", text: "Thất bại" },
    };

    const config = statusConfig[status] || {
      variant: "secondary",
      text: "Không xác định",
    };
    return <Badge bg={config.variant}>{config.text}</Badge>;
  };

  const filterOrders = (status) => {
    if (status === "ALL") return orders;
    return orders.filter((order) => order.status === status);
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  // Mở modal chi tiết
  const handleOpenDetailModal = (order) => {
    setSelectedOrderDetail(order);
    setShowDetailModal(true);
  };

  // Mở modal sửa trạng thái
  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setShowEditModal(true);
  };

  // Mở modal xóa đơn hàng
  const handleOpenDeleteModal = (order) => {
    setOrderToDelete(order);
    setShowDeleteModal(true);
  };

  // Cập nhật trạng thái đơn hàng
  const handleUpdateOrderStatus = async () => {
    if (!selectedOrder || !newStatus) return;

    try {
      await dispatch(
        updateAdminOrderStatusThunk({
          orderId: selectedOrder.id,
          updatedData: { status: newStatus },
        })
      ).unwrap();
      console.log("Hello");

      toast.success("Cập nhật trạng thái đơn hàng thành công!");
      setShowEditModal(false);

      // Refresh dữ liệu sau khi cập nhật thành công
      refreshData();
    } catch (error) {
      toast.error("Cập nhật trạng thái thất bại " + error);
    }
  };

  // Xóa đơn hàng
  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    try {
      await dispatch(deleteAdminOrderThunk(orderToDelete.id)).unwrap();
      toast.success("Xóa đơn hàng thành công!");
      setShowDeleteModal(false);

      // Refresh dữ liệu sau khi xóa thành công
      refreshData();
    } catch (error) {
      toast.error("Xóa đơn hàng thất bại: " + error);
    }
  };

  // Thêm sản phẩm vào giỏ hàng
  const handleAddCartItem = () => {
    setCartItems([...cartItems, { productSizeId: "", quantity: 1 }]);
  };

  // Xóa sản phẩm khỏi giỏ hàng
  const handleRemoveCartItem = (index) => {
    if (cartItems.length > 1) {
      setCartItems(cartItems.filter((_, i) => i !== index));
    }
  };

  // Cập nhật thông tin sản phẩm trong giỏ hàng
  const handleUpdateCartItem = (index, field, value) => {
    const updatedItems = [...cartItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };
    setCartItems(updatedItems);
  };

  // Tính tổng tiền
  const calculateTotalPrice = () => {
    return cartItems.reduce((total, item) => {
      const productInfo = getSelectedProductInfo(item.productSizeId);
      if (productInfo) {
        return total + (productInfo.productPrice || 0) * (item.quantity || 0);
      }
      return total;
    }, 0);
  };

  // Tạo đơn hàng tại chi nhánh
  const handleCreateOrderAtBranch = async () => {
    // Validation
    if (!newOrderData.customerName || !newOrderData.customerPhone) {
      toast.error("Vui lòng nhập đầy đủ thông tin khách hàng!");
      return;
    }

    const validCartItems = cartItems.filter(
      (item) => item.productSizeId && Number(item.quantity) > 0
    );

    if (validCartItems.length === 0) {
      toast.error("Vui lòng thêm ít nhất một sản phẩm!");
      return;
    }

    const totalPrice = calculateTotalPrice();
    if (totalPrice <= 0) {
      toast.error("Tổng tiền phải lớn hơn 0!");
      return;
    }

    const branchId =
      adminInfo?.role === "SUPER_ADMIN" ? null : adminInfo?.branchId;

    if (!branchId && adminInfo?.role !== "SUPER_ADMIN") {
      toast.error("Không tìm thấy thông tin chi nhánh!");
      return;
    }

    try {
      // Map cartItems to API format
      const mappedCartItems = validCartItems.map((item) => {
        const productInfo = getSelectedProductInfo(item.productSizeId);
        return {
          id: productInfo.productId,
          name: productInfo.productName,
          price: productInfo.productPrice,
          quantity: item.quantity,
          size: productInfo.sizeName,
          images: productInfo.productImages || [],
        };
      });

      const orderData = {
        cartItems: mappedCartItems,
        customerInfo: {
          name: newOrderData.customerName,
          phone: newOrderData.customerPhone,
          email: newOrderData.customerEmail || "",
          address: newOrderData.shippingAddress || "",
          message: "",
        },
        totalPrice: totalPrice,
        paymentMethodId: 1, // Default payment method (COD)
        branchId: branchId,
      };

      await dispatch(createOrderAtBranchThunk(orderData)).unwrap();
      toast.success("Tạo đơn hàng thành công!");
      setShowAddModal(false);

      // Reset form
      setNewOrderData({
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        shippingAddress: "",
      });
      setCartItems([{ productSizeId: "", quantity: 1 }]);

      // Refresh dữ liệu sau khi tạo thành công
      refreshData();
    } catch (error) {
      const errorMessage =
        error?.EM || error?.message || "Lỗi khi tạo đơn hàng!";
      toast.error("Tạo đơn hàng thất bại: " + errorMessage);
    }
  };

  return (
    <Container className="manage-orders-container py-5">
      <Card>
        <Card.Header>
          <h2>Quản lý đơn hàng</h2>
        </Card.Header>
        <Card.Body>
          {error && <div className="text-danger">Lỗi: {error}</div>}

          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex gap-2">
              <Button
                variant="outline-primary"
                onClick={refreshData}
                disabled={loading}
              >
                <FaSync className="me-2" />
                Làm mới dữ liệu
              </Button>
              {/* <Button variant="primary" onClick={() => setShowAddModal(true)}>
                <FaPlus className="me-2" />
                Thêm đơn hàng
              </Button> */}
            </div>
            <div className="text-muted">
              Tong so don hang: <strong>{orders.length}</strong>
            </div>
          </div>

          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="mb-4"
          >
            {[
              "ALL",
              "PENDING",
              "CONFIRMED",
              "SHIPPING",
              "COMPLETED",
              "CANCELLED",
            ].map((status) => (
              <Tab
                key={status}
                eventKey={status}
                title={getStatusBadge(status)}
              >
                <OrdersTable
                  orders={filterOrders(status)}
                  loading={loading}
                  getStatusBadge={getStatusBadge}
                  formatPrice={formatPrice}
                  formatDate={formatDate}
                  onViewDetail={handleOpenDetailModal}
                  onEditStatus={handleOpenEditModal}
                  onDeleteOrder={handleOpenDeleteModal}
                />
              </Tab>
            ))}
          </Tabs>
        </Card.Body>
      </Card>

      {/* Modal xem chi tiết đơn hàng */}
      <Modal
        show={showDetailModal}
        onHide={() => setShowDetailModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Chi tiết đơn hàng #{selectedOrderDetail?.id}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrderDetail && (
            <>
              <Row>
                <Col md={6}>
                  <Card className="mb-3">
                    <Card.Header className="bg-primary text-white">
                      <h5 className="mb-0">Thông tin khách hàng</h5>
                    </Card.Header>
                    <Card.Body>
                      <p>
                        <strong>Tên khách hàng:</strong>{" "}
                        {selectedOrderDetail.customerName}
                      </p>
                      <p>
                        <strong>Số điện thoại:</strong>{" "}
                        {selectedOrderDetail.customerPhone}
                      </p>
                      <p>
                        <strong>Email:</strong>{" "}
                        {selectedOrderDetail.customerEmail}
                      </p>
                      <p>
                        <strong>Địa chỉ:</strong>{" "}
                        {selectedOrderDetail.shippingAddress}
                      </p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="mb-3">
                    <Card.Header className="bg-primary text-white">
                      <h5 className="mb-0">Thông tin đơn hàng</h5>
                    </Card.Header>
                    <Card.Body>
                      <p>
                        <strong>Mã đơn hàng:</strong> #
                        {selectedOrderDetail.code}
                      </p>
                      <p>
                        <strong>Ngày đặt:</strong>{" "}
                        {formatDate(selectedOrderDetail.orderDate)}
                      </p>
                      <p>
                        <strong>Trạng thái đơn hàng:</strong>{" "}
                        {getStatusBadge(selectedOrderDetail.status)}
                      </p>
                      <p>
                        <strong>Trạng thái thanh toán:</strong>{" "}
                        {getPaymentStatusBadge(
                          selectedOrderDetail.payment?.status
                        )}
                      </p>
                      <p>
                        <strong>Phương thức thanh toán:</strong>{" "}
                        {selectedOrderDetail.payment?.paymentMethod
                          ?.description || "Không có thông tin"}
                      </p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Card className="mb-3">
                <Card.Header className="bg-primary text-white">
                  <h5 className="mb-0">Sản phẩm</h5>
                </Card.Header>
                <Card.Body>
                  <ListGroup variant="flush">
                    {selectedOrderDetail.ordersDetails?.map((item) => (
                      <ListGroup.Item
                        key={item.id}
                        className="d-flex justify-content-between align-items-center"
                      >
                        <div>
                          <h6>{item.productName}</h6>
                          <p className="mb-0 text-muted">
                            Size: {item.productSize || "N/A"} | Số lượng:{" "}
                            {item.quantity}
                          </p>
                        </div>
                        <div className="text-end">
                          <p className="mb-0">
                            {formatPrice(item.priceAtOrder)}
                          </p>
                          <p className="mb-0 fw-bold">
                            {formatPrice(item.priceAtOrder * item.quantity)}
                          </p>
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>

                  <div className="d-flex justify-content-between mt-3 pt-3 border-top">
                    <h5>Tổng tiền:</h5>
                    <h5 className="text-primary">
                      {formatPrice(
                        selectedOrderDetail.payment?.amount ||
                          selectedOrderDetail.totalPrice
                      )}
                    </h5>
                  </div>
                </Card.Body>
              </Card>

              <div className="d-flex gap-2 justify-content-end">
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowDetailModal(false);
                    handleOpenEditModal(selectedOrderDetail);
                  }}
                >
                  Cập nhật trạng thái
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setShowDetailModal(false);
                    handleOpenDeleteModal(selectedOrderDetail);
                  }}
                >
                  Xóa đơn hàng
                </Button>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Modal cập nhật trạng thái đơn hàng */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Cập nhật trạng thái đơn hàng</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedOrder && (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Mã đơn hàng</Form.Label>
                <Form.Control type="text" value={selectedOrder.code} disabled />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Khách hàng</Form.Label>
                <Form.Control
                  type="text"
                  value={selectedOrder.customerName}
                  disabled
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Trạng thái hiện tại</Form.Label>
                <div>{getStatusBadge(selectedOrder.status)}</div>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Trạng thái mới</Form.Label>
                <Form.Select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="PENDING">Chờ xác nhận</option>
                  <option value="CONFIRMED">Đã xác nhận</option>
                  <option value="SHIPPING">Đang giao</option>
                  <option value="COMPLETED">Đã giao</option>
                  <option value="CANCELLED">Đã hủy</option>
                </Form.Select>
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdateOrderStatus}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Đang xử lý...
              </>
            ) : (
              "Cập nhật"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal xóa đơn hàng */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Xác nhận xóa đơn hàng</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {orderToDelete && (
            <div>
              <p>
                Bạn có chắc chắn muốn xóa đơn hàng <b>#{orderToDelete.id}</b>{" "}
                của khách hàng <b>{orderToDelete.customerName}</b> không?
              </p>
              <p>Hành động này không thể hoàn tác.</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Hủy
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteOrder}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Đang xử lý...
              </>
            ) : (
              "Xóa đơn hàng"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal thêm đơn hàng */}
      <Modal
        show={showAddModal}
        onHide={() => setShowAddModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Thêm đơn hàng mới</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <h5 className="mb-3">Thông tin khách hàng</h5>
            <Form.Group className="mb-3">
              <Form.Label>
                Tên khách hàng <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={newOrderData.customerName}
                onChange={(e) =>
                  setNewOrderData({
                    ...newOrderData,
                    customerName: e.target.value,
                  })
                }
                placeholder="Nhập tên khách hàng"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Số điện thoại <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={newOrderData.customerPhone}
                onChange={(e) =>
                  setNewOrderData({
                    ...newOrderData,
                    customerPhone: e.target.value,
                  })
                }
                placeholder="Nhập số điện thoại"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={newOrderData.customerEmail}
                onChange={(e) =>
                  setNewOrderData({
                    ...newOrderData,
                    customerEmail: e.target.value,
                  })
                }
                placeholder="Nhập email (tùy chọn)"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Địa chỉ giao hàng</Form.Label>
              <Form.Control
                type="text"
                value={newOrderData.shippingAddress}
                onChange={(e) =>
                  setNewOrderData({
                    ...newOrderData,
                    shippingAddress: e.target.value,
                  })
                }
                placeholder="Nhập địa chỉ (tùy chọn)"
              />
            </Form.Group>

            <hr className="my-4" />

            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Sản phẩm</h5>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleAddCartItem}
              >
                <FaPlus className="me-2" />
                Thêm sản phẩm
              </Button>
            </div>

            {cartItems.map((item, index) => {
              const selectedProduct = getSelectedProductInfo(
                item.productSizeId
              );
              const productImages = selectedProduct?.productImages || [];
              const thumbnail =
                productImages.length > 0 ? productImages[0] : null;

              return (
                <Card key={index} className="mb-3">
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <h6 className="mb-0">Sản phẩm #{index + 1}</h6>
                      {cartItems.length > 1 && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleRemoveCartItem(index)}
                        >
                          <FaTimes />
                        </Button>
                      )}
                    </div>

                    <div className="d-flex gap-3 mb-3">
                      {/* Product Image */}
                      <div className="flex-shrink-0">
                        {thumbnail ? (
                          <img
                            src={getImageUrl(thumbnail)}
                            alt={selectedProduct?.productName || "Sản phẩm"}
                            className="rounded"
                            style={{
                              width: "80px",
                              height: "80px",
                              objectFit: "cover",
                              border: "1px solid #dee2e6",
                            }}
                          />
                        ) : (
                          <div
                            className="d-flex align-items-center justify-content-center rounded"
                            style={{
                              width: "80px",
                              height: "80px",
                              backgroundColor: "#f8f9fa",
                              border: "1px solid #dee2e6",
                            }}
                          >
                            <span className="text-muted">No image</span>
                          </div>
                        )}
                      </div>

                      {/* Product Selection */}
                      <div className="flex-grow-1">
                        <Form.Group className="mb-2">
                          <Form.Label>
                            Chọn sản phẩm - Size{" "}
                            <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Select
                            value={item.productSizeId}
                            onChange={(e) =>
                              handleUpdateCartItem(
                                index,
                                "productSizeId",
                                e.target.value
                              )
                            }
                            required
                          >
                            <option value="">Chọn sản phẩm - Size</option>
                            {productSizes.map((ps) => (
                              <option key={ps.id} value={ps.id}>
                                {ps.productName} - {ps.sizeName} (Tồn:{" "}
                                {ps.stock}) - {formatPrice(ps.productPrice)}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>

                        {selectedProduct && (
                          <div className="text-muted small">
                            <div>
                              <strong>{selectedProduct.productName}</strong>
                            </div>
                            <div>
                              Size: {selectedProduct.productSize} | Tồn kho:{" "}
                              {selectedProduct.stock} | Giá:{" "}
                              {formatPrice(selectedProduct.productPrice)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantity */}
                    <Row>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>
                            Số lượng <span className="text-danger">*</span>
                          </Form.Label>
                          <div className="d-flex align-items-center gap-2">
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              onClick={() => {
                                const newQuantity = Math.max(
                                  1,
                                  (item.quantity || 1) - 1
                                );
                                handleUpdateCartItem(
                                  index,
                                  "quantity",
                                  newQuantity
                                );
                              }}
                              disabled={(item.quantity || 1) <= 1}
                            >
                              <FaMinus />
                            </Button>
                            <Form.Control
                              type="number"
                              min="1"
                              value={item.quantity || 1}
                              onChange={(e) => {
                                let value = Number(e.target.value);
                                if (!value || value < 1) value = 1;
                                handleUpdateCartItem(index, "quantity", value);
                              }}
                              style={{ width: "80px", textAlign: "center" }}
                            />
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              onClick={() => {
                                const newQuantity = (item.quantity || 1) + 1;
                                handleUpdateCartItem(
                                  index,
                                  "quantity",
                                  newQuantity
                                );
                              }}
                            >
                              <FaPlus />
                            </Button>
                            {selectedProduct && (
                              <span className="text-muted small ms-2">
                                (Tồn: {selectedProduct.stock})
                              </span>
                            )}
                          </div>
                        </Form.Group>
                      </Col>
                      <Col md={6} className="d-flex align-items-end">
                        <div className="text-end w-100">
                          <strong>
                            Thành tiền:{" "}
                            {selectedProduct
                              ? formatPrice(
                                  selectedProduct.productPrice *
                                    (item.quantity || 1)
                                )
                              : formatPrice(0)}
                          </strong>
                        </div>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              );
            })}

            <div className="d-flex justify-content-between align-items-center p-3 bg-light rounded">
              <h5 className="mb-0">Tổng tiền:</h5>
              <h4 className="mb-0 text-primary">
                {formatPrice(calculateTotalPrice())}
              </h4>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateOrderAtBranch}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Đang xử lý...
              </>
            ) : (
              "Thêm đơn hàng"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

const OrdersTable = ({
  orders,
  loading,
  getStatusBadge,
  formatPrice,
  formatDate,
  onViewDetail,
  onEditStatus,
  onDeleteOrder,
}) => {
  if (loading) {
    return (
      <div className="text-center py-4">
        <Spinner animation="border" variant="primary" />
        <p className="mt-2">Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return <div className="text-center py-4">Không có đơn hàng nào</div>;
  }

  return (
    <div className="table-responsive">
      <Table hover className="orders-table">
        <thead>
          <tr>
            <th>Mã đơn hàng</th>
            <th>Khách hàng</th>
            <th>Địa chỉ</th>
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
              <td>
                {order.customerName}
                <br />
                {order.customerPhone}
              </td>
              <td>{order.shippingAddress}</td>
              <td>{formatDate(order.orderDate)}</td>
              <td className="order-total">
                {formatPrice(order.payment?.amount || order.totalPrice)}
              </td>
              <td>{getStatusBadge(order.status)}</td>
              <td>
                <div className="d-flex gap-2">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => onViewDetail(order)}
                    title="Xem chi tiết"
                  >
                    <FaEye />
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => onEditStatus(order)}
                    title="Cập nhật trạng thái"
                  >
                    <FaEdit />
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onDeleteOrder(order)}
                    title="Xóa đơn hàng"
                  >
                    <FaTrash />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default ManageOrders;
