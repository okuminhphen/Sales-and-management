// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Table,
  Button,
  Modal,
  Form,
  Card,
} from "react-bootstrap";
import axios from "axios";
import { FaPlus, FaEdit, FaTrash, FaSearch, FaTicketAlt } from "react-icons/fa";
import "./Voucher.scss";
import {
  createVoucher,
  deleteVoucher,
  getAllVouchers,
  updateVoucher,
} from "../../services/voucherService";

const Voucher = () => {
  const [vouchers, setVouchers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discount_type: "percent",
    discount_value: "",
    min_order_value: "",
    quantity: "",
    expires_at: "",
  });

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    try {
      const response = await getAllVouchers();
      if (+response.data.EC === 0) {
        setVouchers(response.data.DT);
      }
    } catch (error) {
      console.error("Error fetching vouchers:", error);
    }
  };

  const handleShowAdd = () => {
    setFormData({
      code: "",
      description: "",
      discount_type: "percent",
      discount_value: "",
      min_order_value: "",
      quantity: "",
      expires_at: "",
    });
    setShowAddModal(true);
  };

  const handleShowEdit = (voucher) => {
    setSelectedVoucher(voucher);
    setFormData({
      ...voucher,
      expires_at: new Date(voucher.expires_at).toISOString().slice(0, 16),
    });
    setShowEditModal(true);
  };

  const handleShowDelete = (voucher) => {
    setSelectedVoucher(voucher);
    setShowDeleteModal(true);
  };

  const handleCloseAdd = () => {
    setShowAddModal(false);
    setFormData({
      code: "",
      description: "",
      discount_type: "percent",
      discount_value: "",
      min_order_value: "",
      quantity: "",
      expires_at: "",
    });
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setSelectedVoucher(null);
  };

  const handleCloseDelete = () => {
    setShowDeleteModal(false);
    setSelectedVoucher(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedVoucher) {
        await updateVoucher(selectedVoucher.id, selectedVoucher);
        handleCloseEdit();
      } else {
        await createVoucher(formData);
        handleCloseAdd();
      }
      fetchVouchers();
    } catch (error) {
      console.error("Error saving voucher:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteVoucher(selectedVoucher.id);
      handleCloseDelete();
      fetchVouchers();
    } catch (error) {
      console.error("Error deleting voucher:", error);
    }
  };

  return (
    <div className="voucher-page">
      <Container>
        <div className="page-header">
          <div className="header-content">
            <div className="header-icon">
              <FaTicketAlt />
            </div>
            <div>
              <h2>Quản lý Voucher</h2>
              <p>Quản lý các mã giảm giá và khuyến mãi</p>
            </div>
          </div>
          <Button className="btn-add" onClick={handleShowAdd}>
            <FaPlus className="me-2" />
            Thêm Voucher Mới
          </Button>
        </div>

        <div className="voucher-stats">
          <div className="stat-card">
            <div className="stat-icon">
              <FaTicketAlt />
            </div>
            <div className="stat-info">
              <h4>{vouchers.length}</h4>
              <p>Tổng voucher</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <FaTicketAlt />
            </div>
            <div className="stat-info">
              <h4>
                {
                  vouchers.filter((v) => new Date(v.expires_at) > new Date())
                    .length
                }
              </h4>
              <p>Voucher còn hạn</p>
            </div>
          </div>
        </div>

        <Card className="voucher-table-card">
          <Card.Body>
            <div className="table-responsive">
              <Table hover className="voucher-table">
                <thead>
                  <tr>
                    <th>Mã voucher</th>
                    <th>Mô tả</th>
                    <th>Loại giảm giá</th>
                    <th>Giá trị</th>
                    <th>Đơn hàng tối thiểu</th>
                    <th>Số lượng</th>
                    <th>Hết hạn</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.length > 0 ? (
                    vouchers.map((voucher) => (
                      <tr key={voucher.id}>
                        <td className="voucher-code">{voucher.code}</td>
                        <td className="voucher-desc">{voucher.description}</td>
                        <td>
                          <span
                            className={`badge ${
                              voucher.discount_type === "percent"
                                ? "bg-primary"
                                : "bg-success"
                            }`}
                          >
                            {voucher.discount_type === "percent"
                              ? "Phần trăm"
                              : "Cố định"}
                          </span>
                        </td>
                        <td className="discount-value">
                          {voucher.discount_type === "percent"
                            ? `${voucher.discount_value}%`
                            : `${voucher.discount_value.toLocaleString()}₫`}
                        </td>
                        <td>{voucher.min_order_value.toLocaleString()}₫</td>
                        <td>{voucher.quantity}</td>
                        <td>
                          <span
                            className={`expiry-date ${
                              new Date(voucher.expires_at) < new Date()
                                ? "expired"
                                : ""
                            }`}
                          >
                            {new Date(voucher.expires_at).toLocaleDateString(
                              "vi-VN"
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleShowEdit(voucher)}
                              title="Chỉnh sửa voucher"
                            >
                              <FaEdit />
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => handleShowDelete(voucher)}
                              title="Xóa voucher"
                            >
                              <FaTrash />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="text-center py-4">
                        <div className="empty-state">
                          <FaTicketAlt size={48} className="text-muted mb-3" />
                          <h5>Chưa có voucher nào</h5>
                          <p className="text-muted">
                            Tạo voucher đầu tiên để bắt đầu chương trình khuyến
                            mãi
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>

        {/* Modal Thêm mới */}
        <Modal show={showAddModal} onHide={handleCloseAdd} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Thêm Voucher Mới</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Mã voucher</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Loại giảm giá</Form.Label>
                    <Form.Select
                      value={formData.discount_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_type: e.target.value,
                        })
                      }
                    >
                      <option value="percent">Phần trăm</option>
                      <option value="fixed">Số tiền cố định</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Mô tả</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </Form.Group>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Giá trị giảm giá</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.discount_value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_value: e.target.value,
                        })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Giá trị đơn hàng tối thiểu</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.min_order_value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_order_value: e.target.value,
                        })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Số lượng</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.quantity}
                      onChange={(e) =>
                        setFormData({ ...formData, quantity: e.target.value })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Ngày hết hạn</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      value={formData.expires_at}
                      onChange={(e) =>
                        setFormData({ ...formData, expires_at: e.target.value })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseAdd}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Tạo mới
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Modal Chỉnh sửa */}
        <Modal show={showEditModal} onHide={handleCloseEdit} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Chỉnh sửa Voucher</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Mã voucher</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Loại giảm giá</Form.Label>
                    <Form.Select
                      value={formData.discount_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_type: e.target.value,
                        })
                      }
                    >
                      <option value="percent">Phần trăm</option>
                      <option value="fixed">Số tiền cố định</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Mô tả</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </Form.Group>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Giá trị giảm giá</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.discount_value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_value: e.target.value,
                        })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Giá trị đơn hàng tối thiểu</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.min_order_value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_order_value: e.target.value,
                        })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Số lượng</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.quantity}
                      onChange={(e) =>
                        setFormData({ ...formData, quantity: e.target.value })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Ngày hết hạn</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      value={formData.expires_at}
                      onChange={(e) =>
                        setFormData({ ...formData, expires_at: e.target.value })
                      }
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseEdit}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Cập nhật
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Modal Xóa */}
        <Modal show={showDeleteModal} onHide={handleCloseDelete} centered>
          <Modal.Header closeButton>
            <Modal.Title>Xác nhận xóa</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              Bạn có chắc chắn muốn xóa voucher{" "}
              <strong>{selectedVoucher?.code}</strong> này không?
            </p>
            <p className="text-danger mb-0">
              Lưu ý: Hành động này không thể hoàn tác.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseDelete}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Xóa
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </div>
  );
};

export default Voucher;
