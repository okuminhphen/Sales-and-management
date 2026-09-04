// @ts-nocheck
import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createStockRequestThunk } from "../../store/slices/stockRequestSlice";
import { fetchBranches } from "../../store/slices/branchSlice";
import { fetchInventoryByBranch } from "../../store/slices/inventorySlice";
import { BACKEND_URL } from "../../config/constants";
import {
  FaPlus,
  FaMinus,
  FaTimes,
  FaArrowLeft,
  FaBoxOpen,
} from "react-icons/fa";
import "./StockRequestCreatePage.scss";

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

const getImageUrl = (image) => {
  if (!image) return "";

  // Nếu là object có trường url
  if (typeof image === "object" && image.url) return image.url;

  // Nếu là string
  if (typeof image === "string") {
    if (image.startsWith("http")) return image;
    return `${BACKEND_URL}${image}`;
  }

  return "";
};

const StockRequestCreatePage = ({ setActiveTab }) => {
  const dispatch = useDispatch<any>();
  const { branches } = useSelector((state: any) => state.branch);
  const { items: inventoryItems } = useSelector((state: any) => state.inventory);
  const { adminInfo } = useSelector((state: any) => state.admin);
  const { loading } = useSelector((state: any) => state.stockRequest);

  const [formData, setFormData] = useState({
    fromBranchId: "",
    toBranchId: "",
    items: [{ productSizeId: "", quantity: 1, note: "" }],
  });

  const [toBranchInventory, setToBranchInventory] = useState([]);

  const currentBranchId = adminInfo?.branchId || null;

  useEffect(() => {
    dispatch(fetchBranches());

    if (adminInfo?.branchId) {
      dispatch(fetchInventoryByBranch(String(adminInfo.branchId)));
      setFormData((prev) => ({
        ...prev,
        fromBranchId: adminInfo.branchId,
      }));
    }
  }, [dispatch, adminInfo?.branchId]);

  // Fetch inventory của chi nhánh đích khi toBranchId thay đổi
  useEffect(() => {
    if (formData.toBranchId) {
      dispatch(fetchInventoryByBranch(String(formData.toBranchId)))
        .unwrap()
        .then((data) => {
          setToBranchInventory(data || []);
        })
        .catch((error) => {
          console.error("Error fetching to branch inventory:", error);
          setToBranchInventory([]);
        });
    } else {
      setToBranchInventory([]);
    }
  }, [dispatch, formData.toBranchId]);

  // Lọc branches để chỉ lấy kho tổng (type === "central")
  const centralBranches = useMemo(() => {
    return branches.filter((branch) => branch.type === "central");
  }, [branches]);

  const selectedProductSizeIds = formData.items
    .map((i) => Number(i.productSizeId))
    .filter(Boolean);

  // Lấy tên chi nhánh nguồn từ adminInfo
  const fromBranchName = useMemo(() => {
    if (!currentBranchId) return "";
    const branch = branches.find((b) => b.id === Number(currentBranchId));
    return branch?.name || `Chi nhánh ${currentBranchId}`;
  }, [branches, currentBranchId]);

  // Get product sizes from toBranch inventory với thông tin đầy đủ
  const getProductSizes = () => {
    if (!toBranchInventory || !Array.isArray(toBranchInventory)) return [];

    const sizes = [];
    toBranchInventory.forEach((product) => {
      if (product.sizes && Array.isArray(product.sizes)) {
        product.sizes.forEach((size) => {
          if (size.productSizeId || size.id) {
            const images = parseImages(product.images); // images có thể là array of objects hoặc strings
            sizes.push({
              id: size.productSizeId || size.id,
              productId: product.id,
              productName: product.name,
              productImages: images, // giữ nguyên array, mỗi phần tử là object hoặc string
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
  };

  const productSizes = getProductSizes();

  // Handle submit form
  const handleSubmit = (e) => {
    e.preventDefault();
    const validItems = formData.items.filter(
      (i) => i.productSizeId && Number(i.quantity) > 0
    );

    if (validItems.length === 0) {
      alert("Vui lòng chọn ít nhất 1 sản phẩm hợp lệ");
      return;
    }

    if (
      !formData.fromBranchId ||
      !formData.toBranchId ||
      !formData.items?.length
    ) {
      alert("Vui lòng điền đầy đủ thông tin");
      return;
    }

    // Kiểm tra adminInfo và adminId
    if (!adminInfo || !adminInfo.adminId) {
      alert("Không tìm thấy thông tin admin. Vui lòng đăng nhập lại.");
      return;
    }

    // Kiểm tra chi nhánh đích phải là kho tổng
    const selectedToBranch = centralBranches.find(
      (b) => b.id === Number(formData.toBranchId)
    );
    if (!selectedToBranch) {
      alert("Chi nhánh đích phải là kho tổng (central)");
      return;
    }

    const submitData = {
      fromBranchId: Number(formData.fromBranchId),
      toBranchId: Number(formData.toBranchId),
      items: validItems.map((item) => ({
        productSizeId: Number(item.productSizeId),
        quantity: Number(item.quantity),
        note: item.note || "",
      })),
    };
    dispatch(createStockRequestThunk(submitData)).then((result) => {
      if (!result.error && setActiveTab) {
        setActiveTab("stock-request");
      }
    });
  };

  // Add item to form
  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productSizeId: "", quantity: 1, note: "" }],
    });
  };

  // Remove item from form
  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  // Update item in form
  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  // Get selected product info for display
  const getSelectedProductInfo = (productSizeId) => {
    return productSizes.find((ps) => ps.id === Number(productSizeId));
  };

  return (
    <div className="stock-request-create-page bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => {
              if (setActiveTab) {
                setActiveTab("stock-request");
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition hover:bg-gray-50"
          >
            <FaArrowLeft /> Quay lại
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Tạo yêu cầu tồn kho mới
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Điền thông tin để tạo yêu cầu nhập hàng
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-lg bg-white p-6 shadow">
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {/* Chi nhánh */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Chi nhánh nguồn
                  </label>
                  <input
                    type="text"
                    value={fromBranchName}
                    disabled
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Chi nhánh nguồn được tự động lấy từ chi nhánh của bạn
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Chi nhánh đích (Kho tổng){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.toBranchId}
                    onChange={(e) =>
                      setFormData({ ...formData, toBranchId: e.target.value })
                    }
                    disabled={formData.items.length > 1}
                    className={`mt-1 block w-full rounded-md border px-3 py-2 ${
                      formData.items.length > 1
                        ? "bg-gray-100 cursor-not-allowed"
                        : "border-gray-300"
                    }`}
                    required
                  >
                    <option value="">Chọn kho tổng</option>
                    {centralBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  {centralBranches.length === 0 && (
                    <p className="mt-1 text-xs text-red-500">
                      Không có kho tổng nào trong hệ thống
                    </p>
                  )}
                </div>
              </div>

              {/* Danh sách sản phẩm */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Danh sách sản phẩm
                  </label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700"
                  >
                    <FaPlus /> Thêm sản phẩm
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.items.map((item, index) => {
                    const selectedProduct = getSelectedProductInfo(
                      item.productSizeId
                    );
                    const productImages = selectedProduct?.productImages || [];
                    const thumbnail =
                      productImages.length > 0 ? productImages[0] : null;

                    return (
                      <div
                        key={index}
                        className="rounded-lg border border-gray-200 p-4"
                      >
                        <div className="mb-4 flex items-start gap-4">
                          {/* Ảnh sản phẩm */}
                          <div className="flex-shrink-0">
                            {thumbnail ? (
                              <img
                                src={getImageUrl(thumbnail)} // thumbnail có thể là object hoặc string
                                alt={selectedProduct?.productName || "Sản phẩm"}
                                className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 border border-gray-200">
                                <FaBoxOpen className="text-gray-400 text-2xl" />
                              </div>
                            )}
                          </div>

                          {/* Thông tin sản phẩm */}
                          <div className="flex-1">
                            <select
                              value={item.productSizeId}
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "productSizeId",
                                  e.target.value
                                )
                              }
                              className="block w-full rounded-md border border-gray-300 px-3 py-2 font-medium"
                              required
                            >
                              <option value="">Chọn sản phẩm - Size</option>
                              {productSizes.map((ps) => (
                                <option
                                  key={ps.id}
                                  value={ps.id}
                                  disabled={
                                    selectedProductSizeIds.includes(ps.id) >
                                    ps.stock
                                  }
                                >
                                  {ps.productName} - {ps.sizeName} (Tồn:{" "}
                                  {ps.stock})
                                </option>
                              ))}
                            </select>

                            {selectedProduct && (
                              <div className="mt-2 text-sm text-gray-600">
                                <p className="font-medium text-gray-900">
                                  {selectedProduct.productName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Size: {selectedProduct.sizeName} | Tồn kho:{" "}
                                  {selectedProduct.stock} | Giá:{" "}
                                  {selectedProduct.productPrice?.toLocaleString(
                                    "vi-VN"
                                  )}{" "}
                                  ₫
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Nút xóa */}
                          {formData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="flex-shrink-0 text-red-600 hover:text-red-800"
                            >
                              <FaTimes className="text-lg" />
                            </button>
                          )}
                        </div>

                        {/* Số lượng và ghi chú */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Số lượng
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const newQuantity = Math.max(
                                    1,
                                    (item.quantity || 1) - 1
                                  );
                                  updateItem(index, "quantity", newQuantity);
                                }}
                                disabled={(item.quantity || 1) <= 1}
                                className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"
                              >
                                <FaMinus className="text-xs" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity || 1}
                                onChange={(e) => {
                                  let value = Number(e.target.value);
                                  if (!value || value < 1) value = 1;
                                  updateItem(index, "quantity", value);
                                }}
                                className="w-16 h-8 text-center border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newQuantity = (item.quantity || 1) + 1;
                                  updateItem(index, "quantity", newQuantity);
                                }}
                                className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-600"
                              >
                                <FaPlus className="text-xs" />
                              </button>
                              {selectedProduct && (
                                <span className="text-xs text-gray-500 ml-2">
                                  (Tồn: {selectedProduct.stock})
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Ghi chú (tùy chọn)
                            </label>
                            <input
                              type="text"
                              value={item.note}
                              onChange={(e) =>
                                updateItem(index, "note", e.target.value)
                              }
                              placeholder="Nhập ghi chú"
                              className="block w-full rounded-md border border-gray-300 px-3 py-2"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-6">
              <button
                type="button"
                onClick={() => {
                  if (setActiveTab) {
                    setActiveTab("stock-request");
                  }
                }}
                className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`rounded-lg px-6 py-2 text-white ${
                  loading ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {loading ? "Đang tạo..." : "Tạo yêu cầu"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StockRequestCreatePage;
