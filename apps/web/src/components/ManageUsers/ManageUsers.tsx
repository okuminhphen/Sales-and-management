// @ts-nocheck
import React, { useEffect, useState } from "react";
import {
  Container,
  Table,
  Button,
  Spinner,
  Card,
  Row,
  Col,
  InputGroup,
  Form,
  Badge,
  Modal,
} from "react-bootstrap";
import { FaPlus, FaSync, FaTimes, FaEdit, FaTrash } from "react-icons/fa";

import "./ManageUsers.scss";
import {
  fetchUsers,
  deleteUserThunk,
  createUserThunk,
  updateUserByAdminThunk,
} from "../../store/slices/userSlice";
import { useDispatch, useSelector } from "react-redux";

const ManageUsers = () => {
  // State cho danh sách người dùng
  const { users, loading, error } = useSelector((state: any) => state.user);
  const dispatch = useDispatch<any>();
  // State cho tìm kiếm
  const [searchTerm, setSearchTerm] = useState("");

  // State cho modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // State cho form
  const [formData, setFormData] = useState({
    id: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    roleId: 1, // Default to regular user
  });

  // Lấy danh sách người dùng khi component mount
  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  // Lọc users theo từ khóa tìm kiếm
  const filteredUsers = (users || []).filter(
    (user) =>
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.includes(searchTerm)
  );

  // Xử lý form input
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Xử lý thêm người dùng
  const handleAddUser = () => {
    // TODO: Implement add user logic

    dispatch(createUserThunk(formData));
    setShowAddModal(false);
    dispatch(fetchUsers());
    setFormData({
      username: "",
      email: "",
      phone: "",
      password: "",
      roleId: 1,
    });
  };

  // Xử lý sửa người dùng
  const handleEditUser = () => {
    // TODO: Implement edit user logic

    dispatch(updateUserByAdminThunk(formData));
    dispatch(fetchUsers());
    setShowEditModal(false);
  };

  // Xử lý xóa người dùng
  const handleDeleteUser = () => {
    // TODO: Implement delete user logic
    const userId = selectedUser.id;
    dispatch(deleteUserThunk(userId));
    setShowDeleteModal(false);
  };

  // Mở modal sửa
  const handleEditClick = (user) => {
    setSelectedUser(user);
    setFormData({
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone || "",
      password: "",
      roleId: user.roles[0]?.id || 1,
    });

    setShowEditModal(true);
  };

  // Mở modal xóa
  const handleDeleteClick = (user) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  return (
    <>
      <Container className="manage-users-container py-5">
        <Card>
          <Card.Header>
            <h3>Quan ly nguoi dung</h3>
          </Card.Header>
          <Card.Body>
            {/* Thanh tìm kiếm và nút thêm */}
            <Row className="mb-3">
              <Col md={6}>
                <InputGroup>
                  <Form.Control
                    placeholder="Tìm kiếm theo tên, email, số điện thoại..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Button
                    variant="outline-secondary"
                    onClick={() => setSearchTerm("")}
                  >
                    <FaTimes />
                  </Button>
                </InputGroup>
              </Col>
              <Col md={6} className="text-end">
                <Button
                  variant="success"
                  className="me-2"
                  onClick={() => setShowAddModal(true)}
                >
                  <FaPlus className="me-2" />
                  Thêm người dùng
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={() => dispatch(fetchUsers())}
                  disabled={loading}
                >
                  <FaSync className="me-2" />
                  Làm mới
                </Button>
              </Col>
            </Row>

            {error && <div className="text-danger mb-3">Lỗi: {error}</div>}

            {/* Bảng danh sách người dùng */}
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2">Đang tải dữ liệu...</p>
              </div>
            ) : (
              <div className="table-responsive">
                <Table hover striped>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tên người dùng</th>
                      <th>Email</th>
                      <th>Số điện thoại</th>
                      <th>Vai trò</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user, index) => (
                        <tr key={user.id}>
                          <td>{index + 1}</td>
                          <td>{user.username}</td>
                          <td>{user.email}</td>
                          <td>{user.phone || "N/A"}</td>
                          <td>
                            <Badge
                              bg={
                                user.roles[0]?.name === "admin"
                                  ? "danger"
                                  : "info"
                              }
                            >
                              {user.roles[0]?.name || "Người dùng"}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              variant="warning"
                              size="sm"
                              className="me-2"
                              onClick={() => handleEditClick(user)}
                            >
                              <FaEdit />
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteClick(user)}
                            >
                              <FaTrash />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center">
                          Không tìm thấy người dùng nào
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            )}
          </Card.Body>
        </Card>
      </Container>

      {/* Modal thêm người dùng */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Thêm người dùng mới</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Tên người dùng</Form.Label>
              <Form.Control
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Số điện thoại</Form.Label>
              <Form.Control
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mật khẩu</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Vai trò</Form.Label>
              <Form.Select
                name="roleId"
                value={formData.roleId}
                onChange={handleInputChange}
              >
                <option value={1}>Người dùng</option>
                <option value={2}>Admin</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleAddUser}>
            Thêm
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal sửa người dùng */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Sửa thông tin người dùng</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Tên người dùng</Form.Label>
              <Form.Control
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Số điện thoại</Form.Label>
              <Form.Control
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Mật khẩu mới (để trống nếu không muốn thay đổi)
              </Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Vai trò</Form.Label>
              <Form.Select
                name="roleId"
                value={formData.roleId}
                onChange={handleInputChange}
              >
                <option value={1}>Người dùng</option>
                <option value={2}>Admin</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleEditUser}>
            Lưu thay đổi
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal xóa người dùng */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Xác nhận xóa</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Bạn có chắc chắn muốn xóa người dùng {selectedUser?.username}?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Hủy
          </Button>
          <Button variant="danger" onClick={handleDeleteUser}>
            Xóa
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default ManageUsers;
