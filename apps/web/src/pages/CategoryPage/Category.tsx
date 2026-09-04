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
import { FaPlus, FaEdit, FaTrash, FaTags, FaLayerGroup } from "react-icons/fa";
import "./Category.scss";
import {
  createCategory,
  deleteCategory,
  getAllCategorys,
  updateCategory,
} from "../../services/categoryService";

const Category = () => {
  const [categorys, setCategorys] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  useEffect(() => {
    fetchCategorys();
  }, []);

  const fetchCategorys = async () => {
    try {
      const response = await getAllCategorys();
      if (+response.data.EC === 0) {
        setCategorys(response.data.DT);
      }
      console.log(response.data.DT);
    } catch (error) {
      console.error("Error fetching categorys:", error);
    }
  };

  const handleShowAdd = () => {
    setFormData({
      name: "",
      description: "",
    });
    setShowAddModal(true);
  };

  const handleShowEdit = (category) => {
    setSelectedCategory(category);
    setFormData({
      name: category.name,
      description: category.description,
    });
    setShowEditModal(true);
  };

  const handleShowDelete = (category) => {
    setSelectedCategory(category);
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
    setSelectedCategory(null);
  };

  const handleCloseDelete = () => {
    setShowDeleteModal(false);
    setSelectedCategory(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedCategory) {
        await updateCategory(selectedCategory.id, formData); // <-- dùng formData
        handleCloseEdit();
      } else {
        await createCategory(formData);
        handleCloseAdd();
      }
      fetchCategorys();
    } catch (error) {
      console.error("Error saving Category:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCategory(selectedCategory.id);
      handleCloseDelete();
      fetchCategorys();
    } catch (error) {
      console.error("Error deleting Category:", error);
    }
  };

  return (
    <div className="category-page">
      <Container>
        <div className="page-header">
          <div className="header-content">
            <div className="header-icon">
              <FaTags />
            </div>
            <div>
              <h2>Quản lý Danh mục</h2>
              <p>Quản lý các danh mục sản phẩm</p>
            </div>
          </div>
          <Button className="btn-add" onClick={handleShowAdd}>
            <FaPlus className="me-2" />
            Thêm Danh mục
          </Button>
        </div>

        <div className="category-stats">
          <div className="stat-card">
            <div className="stat-icon">
              <FaLayerGroup />
            </div>
            <div className="stat-info">
              <h4>{categorys.length}</h4>
              <p>Tổng danh mục</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <FaTags />
            </div>
            <div className="stat-info">
              <h4>{categorys.filter((c) => c.name).length}</h4>
              <p>Đã kích hoạt</p>
            </div>
          </div>
        </div>

        <Card className="category-table-card">
          <Card.Body>
            <div className="table-responsive">
              <Table hover className="category-table">
                <thead>
                  <tr>
                    <th>Tên danh mục</th>
                    <th>Mô tả</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {categorys.length > 0 ? (
                    categorys.map((category) => (
                      <tr key={category.id}>
                        <td className="category-name">
                          <div className="category-info">
                            <FaTags className="category-icon" />
                            <span>{category.name}</span>
                          </div>
                        </td>
                        <td className="category-desc">
                          {category.description}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleShowEdit(category)}
                              title="Chỉnh sửa danh mục"
                            >
                              <FaEdit />
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => handleShowDelete(category)}
                              title="Xóa danh mục"
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
                          <FaTags size={48} className="text-muted mb-3" />
                          <h5>Chưa có danh mục nào</h5>
                          <p className="text-muted">
                            Tạo danh mục đầu tiên để phân loại sản phẩm
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
            <Modal.Title>Thêm Category Mới</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label> Category Name</Form.Label>
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
            <Modal.Title>Chỉnh sửa Category</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Category Name</Form.Label>
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
              Bạn có chắc chắn muốn xóa category{" "}
              <strong>{selectedCategory?.name}</strong> này không?
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

export default Category;
