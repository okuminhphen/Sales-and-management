// @ts-nocheck
import { useEffect, useState, useCallback } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { toast } from "react-toastify";
import { fetchCategory } from "../../services/productService";
import { useDispatch, useSelector } from "react-redux";
import { FaPlus, FaSearch, FaEdit, FaTrash } from "react-icons/fa";
import {
  fetchProducts,
  createProduct,
  updateProductAction,
  deleteProductAction,
  resetCreateStatus,
  resetUpdateStatus,
  resetDeleteStatus,
} from "../../store/slices/productSlice";
import { fetchSizes } from "../../store/slices/sizeSlice"; // Thêm import sizeSlice
import {
  Container,
  Card,
  Button,
  Table,
  Badge,
  InputGroup,
  Form,
  Accordion,
  Modal,
  Row,
  Col,
} from "react-bootstrap";
import _ from "lodash";
import "./Products.scss";

const Products = () => {
  const dispatch = useDispatch<any>();
  const { products, status, createStatus, updateStatus, deleteStatus } =
    useSelector((state: any) => state.product);
  const { sizes, status: sizeStatus } = useSelector((state: any) => state.size); // Thêm selector cho sizes
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchProducts());
    }
    if (sizeStatus === "idle") {
      dispatch(fetchSizes()); // Fetch sizes khi component mount
    }
  }, [status, sizeStatus, dispatch]);

  //modal create
  const [isShowCreateModal, setIsShowCreateModal] = useState(false);
  //modal delete
  const [isShowDeleteModal, setIsShowDeleteModal] = useState(false);
  const [selectedProductToDelete, setSelectedProductToDelete] = useState("");
  //modal edit
  const [isShowEditModal, setIsShowEditModal] = useState(false);
  const [selectedProductToEdit, setSelectedProductEdit] = useState({});

  // ========== CREATE MODAL STATE ==========
  const defaultProductValue = {
    name: "",
    images: "",
    categoryId: "",
    description: [],
    price: 0,
  };
  const [createProductData, setCreateProductData] =
    useState(defaultProductValue);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [createImages, setCreateImages] = useState([]);
  const [createPreviews, setCreatePreviews] = useState([]);
  // Thêm state cho sizes trong create modal
  const [createSelectedSizes, setCreateSelectedSizes] = useState([]); // Array of {sizeId, stock}

  // ========== EDIT MODAL STATE ==========
  const defaultEditProductValue = {
    id: "",
    name: "",
    description: [],
    price: "",
    categoryId: "",
  };
  const [editProduct, setEditProduct] = useState(defaultEditProductValue);
  const [editSelectedCategory, setEditSelectedCategory] = useState("");
  const [editImages, setEditImages] = useState([]);
  const [editPreviews, setEditPreviews] = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  // Thêm state cho sizes trong edit modal
  const [editSelectedSizes, setEditSelectedSizes] = useState([]); // Array of {sizeId, stock}

  // ========== FETCH CATEGORIES ==========
  useEffect(() => {
    fetchAllCategory();
  }, []);

  const fetchAllCategory = async () => {
    try {
      const response = await fetchCategory();
      if (response && response.data.EC === 0) {
        setCategories(response.data.DT);
      }
    } catch (error) {
      console.error("Lỗi khi lấy category:", error);
    }
  };

  // ========== CREATE HANDLERS ==========
  // Reset create status when modal closes
  useEffect(() => {
    if (!isShowCreateModal && createStatus === "succeeded") {
      dispatch(resetCreateStatus());
      dispatch(fetchProducts());
    }
  }, [isShowCreateModal, createStatus, dispatch]);

  // Thêm handlers cho sizes trong create modal
  const handleCreateSizeSelect = (sizeId) => {
    setCreateSelectedSizes((prev) => {
      const existingIndex = prev.findIndex((item) => item.sizeId === sizeId);
      if (existingIndex >= 0) {
        // Remove if already selected
        return prev.filter((item) => item.sizeId !== sizeId);
      } else {
        // Add new selection
        return [...prev, { sizeId }];
      }
    });
  };

  const handleCreateImageChange = (e) => {
    const files = Array.from(e.target.files);
    setCreateImages((prevImages) => [...prevImages, ...files]);
    setCreatePreviews((prevPreviews) => [
      ...prevPreviews,
      ...files.map((file) => URL.createObjectURL(file)),
    ]);
  };

  const handleAddCreateDescription = () => {
    setCreateProductData((prevProduct) => ({
      ...prevProduct,
      description: Array.isArray(prevProduct.description)
        ? [...prevProduct.description, { title: "", content: "" }]
        : [{ title: "", content: "" }],
    }));
  };

  const handleCreateDescriptionChange = (index, field, value) => {
    setCreateProductData((prevProduct) => {
      const currentDescription = Array.isArray(prevProduct.description)
        ? prevProduct.description
        : [];

      const updatedDescription = [...currentDescription];
      updatedDescription[index] = {
        ...updatedDescription[index],
        [field]: value,
      };

      return {
        ...prevProduct,
        description: updatedDescription,
      };
    });
  };

  const handleRemoveCreateDescription = (index) => {
    setCreateProductData((prevProduct) => {
      const currentDescription = Array.isArray(prevProduct.description)
        ? prevProduct.description
        : [];

      return {
        ...prevProduct,
        description: currentDescription.filter((_, i) => i !== index),
      };
    });
  };

  const handleRemoveCreateImage = (index) => {
    setCreateImages((prevImages) => prevImages.filter((_, i) => i !== index));
    setCreatePreviews((prevPreviews) =>
      prevPreviews.filter((_, i) => i !== index)
    );
  };

  const handleCreateSubmit = async () => {
    if (!createProductData.name.trim()) {
      toast.error("Vui lòng nhập tên sản phẩm");
      return;
    }
    if (!selectedCategory) {
      toast.error("Vui lòng chọn danh mục");
      return;
    }
    if (createImages.length === 0) {
      toast.error("Vui lòng chọn ít nhất một ảnh");
      return;
    }
    if (createSelectedSizes.length === 0) {
      toast.error("Vui lòng chọn ít nhất một size");
      return;
    }

    const formData = new FormData();
    formData.append("name", createProductData.name);
    formData.append("price", Number(createProductData.price));
    formData.append("categoryId", selectedCategory);
    formData.append(
      "description",
      JSON.stringify(createProductData.description)
    );
    formData.append("sizes", JSON.stringify(createSelectedSizes)); // Thêm sizes data

    createImages.forEach((file) => {
      formData.append("images", file);
    });

    const result = await dispatch(createProduct(formData));

    if (createProduct.fulfilled.match(result)) {
      setCreateProductData(defaultProductValue);
      setCreateImages([]);
      setCreatePreviews([]);
      setSelectedCategory("");
      setCreateSelectedSizes([]); // Reset sizes
      setIsShowCreateModal(false);
      dispatch(fetchProducts());
    }
  };

  // ========== EDIT HANDLERS ==========
  const checkJSONParseImage = () => {
    let existingImages = [];

    if (
      selectedProductToEdit.images &&
      typeof selectedProductToEdit.images === "string" &&
      selectedProductToEdit.images.trim() !== ""
    ) {
      try {
        existingImages = JSON.parse(selectedProductToEdit.images);

        if (
          typeof existingImages === "string" &&
          existingImages.trim() !== ""
        ) {
          existingImages = JSON.parse(existingImages);
        }
      } catch (error) {
        console.error("Lỗi khi parse images:", error);
        existingImages = [];
      }
    }

    setExistingImages(Array.isArray(existingImages) ? existingImages : []);
  };

  const fetchAProduct = useCallback(() => {
    if (selectedProductToEdit) {
      let parsedDescription = [];
      try {
        if (selectedProductToEdit.description) {
          const parsed = JSON.parse(selectedProductToEdit.description);
          parsedDescription = Array.isArray(parsed) ? parsed : [];
        }
      } catch (error) {
        console.error("Error parsing description:", error);
        parsedDescription = [];
      }

      setEditProduct({
        id: selectedProductToEdit.id || "",
        name: selectedProductToEdit.name || "",
        description: parsedDescription,
        price: selectedProductToEdit.price || 0,
        categoryId: selectedProductToEdit.Category
          ? selectedProductToEdit.Category.id
          : "",
      });

      setEditSelectedCategory(
        selectedProductToEdit.Category ? selectedProductToEdit.Category.id : ""
      );

      // Parse existing sizes data
      if (
        selectedProductToEdit.sizes &&
        Array.isArray(selectedProductToEdit.sizes)
      ) {
        const existingSizes = selectedProductToEdit.sizes.map((size) => ({
          sizeId: size.id,
        }));
        setEditSelectedSizes(existingSizes);
      } else {
        setEditSelectedSizes([]);
      }

      checkJSONParseImage();
    }
  }, [selectedProductToEdit]);

  useEffect(() => {
    if (isShowEditModal && selectedProductToEdit.id) {
      fetchAProduct();
    }
  }, [isShowEditModal, selectedProductToEdit, fetchAProduct]);

  // Reset update status when modal closes
  useEffect(() => {
    if (!isShowEditModal && updateStatus === "succeeded") {
      dispatch(resetUpdateStatus());
      dispatch(fetchProducts());
    }
  }, [isShowEditModal, updateStatus, dispatch]);

  // Thêm handlers cho sizes trong edit modal
  const handleEditSizeSelect = (sizeId) => {
    setEditSelectedSizes((prev) => {
      const existingIndex = prev.findIndex((item) => item.sizeId === sizeId);
      if (existingIndex >= 0) {
        // Remove if already selected
        return prev.filter((item) => item.sizeId !== sizeId);
      } else {
        // Add new selection
        return [...prev, { sizeId }];
      }
    });
  };

  const handleEditImageChange = (e) => {
    const files = Array.from(e.target.files);
    setEditImages((prevImages) => [...prevImages, ...files]);
    setEditPreviews((prevPreviews) => [
      ...prevPreviews,
      ...files.map((file) => URL.createObjectURL(file)),
    ]);
  };

  const handleAddEditDescription = () => {
    setEditProduct((prevProduct) => ({
      ...prevProduct,
      description: Array.isArray(prevProduct.description)
        ? [...prevProduct.description, { title: "", content: "" }]
        : [{ title: "", content: "" }],
    }));
  };

  const handleEditDescriptionChange = (index, field, value) => {
    setEditProduct((prevProduct) => {
      const currentDescription = Array.isArray(prevProduct.description)
        ? prevProduct.description
        : [];

      const updatedDescription = [...currentDescription];
      updatedDescription[index] = {
        ...updatedDescription[index],
        [field]: value,
      };

      return {
        ...prevProduct,
        description: updatedDescription,
      };
    });
  };

  const handleRemoveEditDescription = (index) => {
    setEditProduct((prevProduct) => {
      const currentDescription = Array.isArray(prevProduct.description)
        ? prevProduct.description
        : [];

      return {
        ...prevProduct,
        description: currentDescription.filter((_, i) => i !== index),
      };
    });
  };

  const handleRemoveExistingImage = (index) => {
    setExistingImages((prevImages) => prevImages.filter((_, i) => i !== index));
  };

  const handleRemoveEditImage = (index) => {
    setEditImages((prevImages) => prevImages.filter((_, i) => i !== index));
    setEditPreviews((prevPreviews) =>
      prevPreviews.filter((_, i) => i !== index)
    );
  };

  const handleEditSubmit = async () => {
    if (editSelectedSizes.length === 0) {
      toast.error("Vui lòng chọn ít nhất một size");
      return;
    }

    const formData = new FormData();

    formData.append("name", editProduct.name);
    formData.append("price", Number(editProduct.price));
    formData.append("categoryId", editSelectedCategory);
    formData.append("description", JSON.stringify(editProduct.description));
    formData.append("sizes", JSON.stringify(editSelectedSizes)); // Thêm sizes data

    // Ảnh cũ còn giữ
    formData.append("existingImages", JSON.stringify(existingImages));

    // Ảnh mới
    editImages.forEach((file) => {
      formData.append("images", file);
    });

    const result = await dispatch(
      updateProductAction({ id: editProduct.id, productData: formData })
    );

    if (updateProductAction.fulfilled.match(result)) {
      setIsShowEditModal(false);
      dispatch(fetchProducts());
    }
  };

  // ========== DELETE HANDLERS ==========
  // Reset delete status when modal closes
  useEffect(() => {
    if (!isShowDeleteModal && deleteStatus === "succeeded") {
      dispatch(resetDeleteStatus());
      dispatch(fetchProducts());
    }
  }, [isShowDeleteModal, deleteStatus, dispatch]);

  const handleOnClickDelete = (productId) => {
    setIsShowDeleteModal(true);
    setSelectedProductToDelete(productId);
  };

  const handleDelete = async () => {
    if (!selectedProductToDelete) {
      return;
    }
    try {
      const result = await dispatch(
        deleteProductAction(selectedProductToDelete)
      );
      if (deleteProductAction.fulfilled.match(result)) {
        setSelectedProductToDelete("");
        setIsShowDeleteModal(false);
        // Fetch lại danh sách sản phẩm
        dispatch(fetchProducts());
      }
    } catch (e) {
      // Error handling
    }
  };

  const handleOnClickEdit = (product) => {
    setIsShowEditModal(true);
    setSelectedProductEdit(product);
  };

  // ========== UTILITY FUNCTIONS ==========
  const getProductImages = (images) => {
    if (!images) return [];
    if (Array.isArray(images)) return images;

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

    return Array.isArray(parsedImages) ? parsedImages : [];
  };

  const parseDescription = (description) => {
    if (!description) return [];
    if (Array.isArray(description)) return description;

    try {
      const parsed = JSON.parse(description);
      if (Array.isArray(parsed)) return parsed;

      if (typeof parsed === "string") {
        const parsedAgain = JSON.parse(parsed);
        if (Array.isArray(parsedAgain)) return parsedAgain;
        if (parsedAgain)
          return [{ title: "Mô tả", content: parsedAgain.toString() }];
      }
    } catch (error) {
      if (typeof description === "string" && description.trim() !== "") {
        return [{ title: "Mô tả", content: description }];
      }
    }

    return [];
  };

  const formatPrice = (price) => {
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice)) return "0";
    return numericPrice.toLocaleString();
  };

  const filteredProducts =
    products?.filter(
      (product) =>
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.Category?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  return (
    <>
      <Container className="manage-products-container py-5">
        <Card>
          <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
            <h3 className="mb-0">Quản lý sản phẩm</h3>
            <Button variant="light" onClick={() => setIsShowCreateModal(true)}>
              <FaPlus className="me-2" />
              Thêm sản phẩm
            </Button>
          </Card.Header>
          <Card.Body>
            {/* Thanh tìm kiếm */}
            <div className="mb-4">
              <InputGroup>
                <InputGroup.Text>
                  <FaSearch />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Tìm kiếm theo tên hoặc danh mục..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Button
                  variant="outline-secondary"
                  onClick={() => setSearchTerm("")}
                >
                  <i className="fas fa-times"></i>
                </Button>
              </InputGroup>
            </div>

            {/* Bảng sản phẩm */}
            <div className="table-responsive">
              <Table hover striped className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Tên sản phẩm</th>
                    <th>Hình ảnh</th>
                    <th>Danh mục</th>
                    <th>Giá</th>
                    <th>Sizes</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => {
                      const images = getProductImages(product.images);
                      const parsedDescription = parseDescription(
                        product.description
                      );

                      return (
                        <tr key={product.id}>
                          <td>{product.id}</td>
                          <td>
                            <div className="product-name">{product.name}</div>
                            <div className="product-details mt-2">
                              {parsedDescription.length > 0 ? (
                                <Accordion>
                                  {parsedDescription.map((descItem, index) => (
                                    <Accordion.Item
                                      key={index}
                                      eventKey={index.toString()}
                                    >
                                      <Accordion.Header>
                                        {descItem.title || `Mô tả ${index + 1}`}
                                      </Accordion.Header>
                                      <Accordion.Body>
                                        <div
                                          className="description-content"
                                          style={{
                                            whiteSpace: "pre-wrap",
                                            backgroundColor: "#f8f9fa",
                                            padding: "10px",
                                            borderRadius: "4px",
                                            border: "1px solid #dee2e6",
                                            minHeight: "100px",
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                          }}
                                        >
                                          {descItem.content ||
                                            "Không có nội dung"}
                                        </div>
                                      </Accordion.Body>
                                    </Accordion.Item>
                                  ))}
                                </Accordion>
                              ) : (
                                <span className="text-muted">
                                  Không có mô tả
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="product-images">
                              {images.length > 0 ? (
                                images.map((image, index) => (
                                  <img
                                    key={index}
                                    src={image.url}
                                    alt={`Ảnh sản phẩm ${index + 1}`}
                                    className="product-thumbnail"
                                  />
                                ))
                              ) : (
                                <span className="text-muted">Không có ảnh</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <Badge bg="info">
                              {product.Category?.name || "Không có danh mục"}
                            </Badge>
                          </td>
                          <td>
                            <div className="price">
                              {formatPrice(product.price)} VND
                            </div>
                          </td>
                          <td>
                            <div className="product-sizes">
                              {product.sizes && product.sizes.length > 0 ? (
                                product.sizes.map((size, index) => (
                                  <Badge
                                    key={index}
                                    bg="secondary"
                                    className="me-1 mb-1"
                                  >
                                    {size.name}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted">Chưa có size</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <Button
                                variant="outline-primary"
                                size="sm"
                                className="me-2"
                                onClick={() => handleOnClickEdit(product)}
                              >
                                <FaEdit />
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => handleOnClickDelete(product.id)}
                              >
                                <FaTrash />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="text-center py-4">
                        Không tìm thấy sản phẩm nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>

        {/* ========== MODAL CREATE ========== */}
        <Modal
          show={isShowCreateModal}
          onHide={() => {
            setIsShowCreateModal(false);
            setCreateProductData(defaultProductValue);
            setSelectedCategory("");
            setCreateImages([]);
            setCreatePreviews([]);
            setCreateSelectedSizes([]);
          }}
          centered
          size="xl"
          dialogClassName="modal-90w"
        >
          <Modal.Header closeButton>
            <Modal.Title>Thêm Sản Phẩm</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Tên sản phẩm</Form.Label>
                    <Form.Control
                      type="text"
                      value={createProductData.name}
                      onChange={(e) => {
                        setCreateProductData({
                          ...createProductData,
                          name: e.target.value,
                        });
                      }}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <Form.Label>Mô tả</Form.Label>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={handleAddCreateDescription}
                      >
                        <i className="fas fa-plus"></i> Thêm mô tả
                      </Button>
                    </div>
                    {(Array.isArray(createProductData.description)
                      ? createProductData.description
                      : []
                    ).map((desc, index) => (
                      <div key={index} className="mb-3 p-2 border rounded">
                        <div className="d-flex justify-content-between mb-2">
                          <Form.Label className="mb-1">
                            Mô tả {index + 1}
                          </Form.Label>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemoveCreateDescription(index)}
                          >
                            <i className="fas fa-times"></i>
                          </Button>
                        </div>
                        <Form.Control
                          type="text"
                          placeholder="Tiêu đề mô tả"
                          value={desc.title}
                          onChange={(e) =>
                            handleCreateDescriptionChange(
                              index,
                              "title",
                              e.target.value
                            )
                          }
                          className="mb-2"
                        />
                        <Form.Control
                          as="textarea"
                          rows={3}
                          placeholder="Nội dung mô tả"
                          value={desc.content}
                          onChange={(e) =>
                            handleCreateDescriptionChange(
                              index,
                              "content",
                              e.target.value
                            )
                          }
                          style={{
                            resize: "none",
                            whiteSpace: "pre-wrap",
                            backgroundColor: "#f8f9fa",
                            padding: "10px",
                            borderRadius: "4px",
                            border: "1px solid #dee2e6",
                            minHeight: "100px",
                            maxHeight: "200px",
                            overflowY: "auto",
                          }}
                        />
                      </div>
                    ))}
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Giá</Form.Label>
                    <Form.Control
                      type="number"
                      value={createProductData.price}
                      onChange={(e) =>
                        setCreateProductData({
                          ...createProductData,
                          price: e.target.value,
                        })
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Chọn danh mục</Form.Label>
                    <Form.Select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                      }}
                    >
                      <option value="">Chọn danh mục</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  {/* Sizes selection for create */}
                  <Form.Group className="mb-3">
                    <Form.Label>Chọn Sizes</Form.Label>
                    <div className="border rounded p-3">
                      {sizes && sizes.length > 0 ? (
                        sizes.map((size) => {
                          const isSelected = createSelectedSizes.some(
                            (item) => item.sizeId === size.id
                          );

                          return (
                            <div
                              key={size.id}
                              className="d-flex align-items-center mb-2"
                            >
                              <Form.Check
                                type="checkbox"
                                id={`create-size-${size.id}`}
                                label={size.name}
                                checked={isSelected}
                                onChange={() => handleCreateSizeSelect(size.id)}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-muted">
                          Đang tải danh sách sizes...
                        </p>
                      )}
                    </div>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Ảnh sản phẩm</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleCreateImageChange}
                    />
                    <div className="d-flex mt-2">
                      {createPreviews.map((src, index) => (
                        <div key={index} className="position-relative me-2">
                          <img
                            src={src}
                            alt="Preview"
                            width="80"
                            className="rounded"
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            className="position-absolute top-0 end-0"
                            onClick={() => handleRemoveCreateImage(index)}
                          >
                            ✖
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                setIsShowCreateModal(false);
                setCreateProductData(defaultProductValue);
                setSelectedCategory("");
                setCreateImages([]);
                setCreatePreviews([]);
                setCreateSelectedSizes([]);
              }}
            >
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreateSubmit}>
              Thêm
            </Button>
          </Modal.Footer>
        </Modal>

        {/* ========== MODAL EDIT ========== */}
        <Modal
          show={isShowEditModal}
          onHide={() => {
            setIsShowEditModal(false);
            setEditProduct(defaultEditProductValue);
            setEditSelectedCategory("");
            setEditImages([]);
            setEditPreviews([]);
            setExistingImages([]);
            setEditSelectedSizes([]);
          }}
          centered
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>Chỉnh sửa Sản Phẩm</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Tên sản phẩm</Form.Label>
                    <Form.Control
                      type="text"
                      value={editProduct.name || ""}
                      onChange={(e) => {
                        setEditProduct({
                          ...editProduct,
                          name: e.target.value,
                        });
                      }}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <Form.Label>Mô tả</Form.Label>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={handleAddEditDescription}
                      >
                        <i className="fas fa-plus"></i> Thêm mô tả
                      </Button>
                    </div>
                    {(Array.isArray(editProduct.description)
                      ? editProduct.description
                      : []
                    ).map((desc, index) => (
                      <div key={index} className="mb-3 p-2 border rounded">
                        <div className="d-flex justify-content-between mb-2">
                          <Form.Label className="mb-1">
                            Mô tả {index + 1}
                          </Form.Label>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemoveEditDescription(index)}
                          >
                            <i className="fas fa-times"></i>
                          </Button>
                        </div>
                        <Form.Control
                          type="text"
                          placeholder="Tiêu đề mô tả"
                          value={desc.title}
                          onChange={(e) =>
                            handleEditDescriptionChange(
                              index,
                              "title",
                              e.target.value
                            )
                          }
                          className="mb-2"
                        />
                        <Form.Control
                          as="textarea"
                          rows={3}
                          placeholder="Nội dung mô tả"
                          value={desc.content}
                          onChange={(e) =>
                            handleEditDescriptionChange(
                              index,
                              "content",
                              e.target.value
                            )
                          }
                          style={{
                            resize: "none",
                            whiteSpace: "pre-wrap",
                            backgroundColor: "#f8f9fa",
                            padding: "10px",
                            borderRadius: "4px",
                            border: "1px solid #dee2e6",
                            minHeight: "100px",
                            maxHeight: "200px",
                            overflowY: "auto",
                          }}
                        />
                      </div>
                    ))}
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Giá</Form.Label>
                    <Form.Control
                      type="number"
                      value={editProduct.price || ""}
                      onChange={(e) =>
                        setEditProduct({
                          ...editProduct,
                          price: e.target.value,
                        })
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Chọn danh mục</Form.Label>
                    <Form.Select
                      value={editSelectedCategory || ""}
                      onChange={(e) => {
                        setEditSelectedCategory(e.target.value);
                      }}
                    >
                      <option value="">Chọn danh mục</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  {/* Sizes selection for edit */}
                  <Form.Group className="mb-3">
                    <Form.Label>Chọn Sizes</Form.Label>
                    <div className="border rounded p-3">
                      {sizes && sizes.length > 0 ? (
                        sizes.map((size) => {
                          const isSelected = editSelectedSizes.some(
                            (item) => item.sizeId === size.id
                          );

                          return (
                            <div
                              key={size.id}
                              className="d-flex align-items-center mb-2"
                            >
                              <Form.Check
                                type="checkbox"
                                id={`edit-size-${size.id}`}
                                label={size.name}
                                checked={isSelected}
                                onChange={() => handleEditSizeSelect(size.id)}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-muted">
                          Đang tải danh sách sizes...
                        </p>
                      )}
                    </div>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Ảnh sản phẩm</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleEditImageChange}
                    />

                    <div className="d-flex mt-2">
                      {existingImages.map((src, index) => (
                        <div key={index} className="position-relative me-2">
                          <img
                            src={src.url}
                            alt="Ảnh cũ"
                            width="80"
                            className="rounded"
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            className="position-absolute top-0 end-0"
                            onClick={() => handleRemoveExistingImage(index)}
                          >
                            ✖
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="d-flex mt-2">
                      {editPreviews.map((src, index) => (
                        <div key={index} className="position-relative me-2">
                          <img
                            src={src}
                            alt="Ảnh mới"
                            width="80"
                            className="rounded"
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            className="position-absolute top-0 end-0"
                            onClick={() => handleRemoveEditImage(index)}
                          >
                            ✖
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => {
                setIsShowEditModal(false);
                setEditProduct(defaultEditProductValue);
                setEditSelectedCategory("");
                setEditImages([]);
                setEditPreviews([]);
                setExistingImages([]);
                setEditSelectedSizes([]);
              }}
            >
              Hủy
            </Button>
            <Button variant="primary" onClick={handleEditSubmit}>
              Cập nhật
            </Button>
          </Modal.Footer>
        </Modal>

        {/* ========== MODAL DELETE ========== */}
        <Modal
          show={isShowDeleteModal}
          onHide={() => setIsShowDeleteModal(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Xác nhận xóa sản phẩm</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>Bạn có chắc chắn muốn xóa sản phẩm này?</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setIsShowDeleteModal(false)}
            >
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Xóa
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </>
  );
};

export default Products;
