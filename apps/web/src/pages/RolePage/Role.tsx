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
import { FaPlus, FaEdit, FaTrash, FaUserShield, FaUsers } from "react-icons/fa";
import "./Role.scss";
import {
  createRole,
  deleteRole,
  getAllRoles,
  updateRole,
} from "../../services/roleService";

const Role = () => {
  const [roles, setRoles] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const response = await getAllRoles();
      if (+response.data.EC === 0) {
        setRoles(response.data.DT);
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  };

  const handleShowAdd = () => {
    setFormData({
      name: "",
      description: "",
    });
    setShowAddModal(true);
  };

  const handleShowEdit = (role) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      description: role.description,
    });
    setShowEditModal(true);
  };

  const handleShowDelete = (role) => {
    setSelectedRole(role);
    setShowDeleteModal(true);
  };

  const handleCloseAdd = () => {
    setShowAddModal(false);
    setFormData({
      name: "",
      description: "",
    });
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setSelectedRole(null);
  };

  const handleCloseDelete = () => {
    setShowDeleteModal(false);
    setSelectedRole(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedRole) {
        await updateRole(selectedRole.id, formData); // <-- dùng formData
        handleCloseEdit();
      } else {
        await createRole(formData);
        handleCloseAdd();
      }
      fetchRoles();
    } catch (error) {
      console.error("Error saving Role:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRole(selectedRole.id);
      handleCloseDelete();
      fetchRoles();
    } catch (error) {
      console.error("Error deleting Role:", error);
    }
  };

  return (
    <div className="role-page">
      <Container>
        <div className="page-header">
          <div className="header-content">
            <div className="header-icon">
              <FaUserShield />
            </div>
            <div>
              <h2>Quản lý Vai trò</h2>
              <p>Quản lý các vai trò và quyền hạn trong hệ thống</p>
            </div>
          </div>
          <Button className="btn-add" onClick={handleShowAdd}>
            <FaPlus className="me-2" />
            Thêm Vai trò
          </Button>
        </div>

        <div className="role-stats">
          <div className="stat-card">
            <div className="stat-icon">
              <FaUsers />
            </div>
            <div className="stat-info">
              <h4>{roles.length}</h4>
              <p>Tổng vai trò</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <FaUserShield />
            </div>
            <div className="stat-info">
              <h4>{roles.filter((r) => r.name).length}</h4>
              <p>Đã kích hoạt</p>
            </div>
          </div>
        </div>

        <Card className="role-table-card">
          <Card.Body>
            <div className="table-responsive">
              <Table hover className="role-table">
                <thead>
                  <tr>
                    <th>Tên vai trò</th>
                    <th>Mô tả</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <tr key={role.id}>
                        <td className="role-name">
                          <div className="role-info">
                            <FaUserShield className="role-icon" />
                            <span>{role.name}</span>
                          </div>
                        </td>
                        <td className="role-desc">{role.description}</td>
                        <td>
                          <div className="action-buttons">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleShowEdit(role)}
                              title="Chỉnh sửa vai trò"
                            >
                              <FaEdit />
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => handleShowDelete(role)}
                              title="Xóa vai trò"
                            >
                              <FaTrash />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="text-center py-4">
                        <div className="empty-state">
                          <FaUserShield size={48} className="text-muted mb-3" />
                          <h5>Chưa có vai trò nào</h5>
                          <p className="text-muted">
                            Tạo vai trò đầu tiên để phân quyền người dùng
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
            <Modal.Title>Thêm Role Mới</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label> Role Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                    />
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
            <Modal.Title>Chỉnh sửa Role</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Role Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                    />
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
              Bạn có chắc chắn muốn xóa role{" "}
              <strong>{selectedRole?.name}</strong> này không?
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

export default Role;
