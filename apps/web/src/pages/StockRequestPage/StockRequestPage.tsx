// @ts-nocheck
import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchMyStockRequests,
  updateStockRequestInfoThunk,
  deleteStockRequestThunk,
  setSelectedRequest,
  clearSelectedRequest,
} from "../../store/slices/stockRequestSlice";
import { fetchBranches } from "../../store/slices/branchSlice";
import { fetchInventoryByBranch } from "../../store/slices/inventorySlice";
import {
  FaPlus,
  FaSearch,
  FaEye,
  FaEdit,
  FaTrash,
  FaHistory,
  FaFilter,
  FaTimes,
  FaClock,
} from "react-icons/fa";
import "./StockRequestPage.scss";

const StockRequestPage = ({ setActiveTab }) => {
  const dispatch = useDispatch<any>();
  const { requests, loading } = useSelector((state: any) => state.stockRequest);
  const { branches } = useSelector((state: any) => state.branch);
  const { items: inventoryItems } = useSelector((state: any) => state.inventory);
  const { adminInfo } = useSelector((state: any) => state.admin);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAllHistoryModal, setShowAllHistoryModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [searchCode, setSearchCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingRequest, setEditingRequest] = useState(null);
  // Form state for create/edit
  const [formData, setFormData] = useState({
    fromBranchId: "",
    toBranchId: "",
    note: "",
    items: [{ productSizeId: "", quantity: 1, note: "" }],
  });

  // Keep fromBranchId in sync with admin branch when creating
  useEffect(() => {
    if (!editingRequest && adminInfo?.branchId) {
      setFormData((prev) => ({
        ...prev,
        fromBranchId: String(adminInfo.branchId),
      }));
    }
  }, [adminInfo?.branchId, editingRequest]);

  useEffect(() => {
    dispatch(fetchBranches());
    if (adminInfo?.adminId) {
      dispatch(fetchMyStockRequests(Number(adminInfo.branchId)));
      dispatch(fetchInventoryByBranch(String(adminInfo.branchId)));
    }
  }, [dispatch, adminInfo?.adminId, adminInfo?.branchId]);

  // Get current branch ID
  const currentBranchId = adminInfo?.branchId || null;

  // Filter requests
  const filteredRequests = useMemo(() => {
    let filtered = (requests || []).filter(
      (req) => req && typeof req === "object" && req.id && req.code
    ); // loại bỏ null/undefined và object không hợp lệ

    if (searchCode.trim()) {
      filtered = filtered.filter((req) =>
        req.code?.toLowerCase().includes(searchCode.toLowerCase().trim())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }

    return filtered;
  }, [requests, searchCode, statusFilter]);

  // Get status badge color
  const getStatusBadge = (status) => {
    const statusMap = {
      pending: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        label: "Chờ duyệt",
      },
      approved: {
        bg: "bg-green-100",
        text: "text-green-800",
        label: "Đã duyệt",
      },
      rejected: { bg: "bg-red-100", text: "text-red-800", label: "Từ chối" },
      transferred: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        label: "Đã chuyển",
      },
      received: {
        bg: "bg-purple-100",
        text: "text-purple-800",
        label: "Đã nhận",
      },
    };
    const statusInfo = statusMap[status] || {
      bg: "bg-gray-100",
      text: "text-gray-800",
      label: status,
    };
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.bg} ${statusInfo.text}`}
      >
        {statusInfo.label}
      </span>
    );
  };

  // Handle create - switch to create page component
  const handleCreate = () => {
    if (!currentBranchId) {
      alert("Không tìm thấy thông tin chi nhánh. Vui lòng đăng nhập lại.");
      return;
    }
    if (setActiveTab) {
      setActiveTab("stock-request-create");
    }
  };

  // Handle edit
  const handleEdit = (request) => {
    setEditingRequest(request);
    setFormData({
      fromBranchId: request.fromBranchId || currentBranchId || "",
      toBranchId: request.toBranchId || "",
      note: request.note || "",
      items:
        request.items?.length > 0
          ? request.items.map((item) => ({
              productSizeId: item.productSizeId,
              quantity: item.quantity,
              note: item.note || "",
            }))
          : [{ productSizeId: "", quantity: 1, note: "" }],
    });
    setShowCreateModal(true);
  };

  // Lấy tên chi nhánh nguồn khi edit
  const getFromBranchNameForEdit = () => {
    if (!editingRequest) return fromBranchName;
    const branch = branches.find(
      (b) => b.id === Number(editingRequest.fromBranchId)
    );
    return branch?.name || `Chi nhánh ${editingRequest.fromBranchId}`;
  };

  // Handle view detail
  const handleViewDetail = (request) => {
    dispatch(setSelectedRequest(request));
    setShowDetailModal(true);
  };

  // Handle view history
  const handleViewHistory = (request) => {
    dispatch(setSelectedRequest(request));
    setShowHistoryModal(true);
  };

  // Handle delete
  const handleDelete = (id) => {
    setSelectedRequestId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (selectedRequestId) {
      dispatch(
        deleteStockRequestThunk(selectedRequestId)
      ).then(() => {
        setShowDeleteConfirm(false);
        setSelectedRequestId(null);
        dispatch(fetchMyStockRequests(Number(adminInfo.branchId)));
      });
    }
  };

  // Handle submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    if (
      !(formData.fromBranchId || currentBranchId) ||
      !formData.toBranchId ||
      !formData.items?.length
    ) {
      alert("Vui lòng điền đầy đủ thông tin");
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

    const validItems = formData.items
      .filter((item) => item.productSizeId && Number(item.quantity) > 0)
      .map((item) => ({
        productSizeId: Number(item.productSizeId),
        quantity: Number(item.quantity),
        note: item.note || "",
      }));

    if (validItems.length === 0) {
      alert("Vui lòng chọn ít nhất một sản phẩm với số lượng hợp lệ");
      return;
    }

    // Chỉ gửi các field có thể update
    const updateData = {
      toBranchId: Number(formData.toBranchId),
      note: formData.note || "",
      items: validItems,
    };
    dispatch(
      updateStockRequestInfoThunk({
        id: editingRequest.id,
        data: updateData,
      })
    ).then(() => {
      setShowCreateModal(false);
      setEditingRequest(null);
      dispatch(fetchMyStockRequests(Number(adminInfo.branchId)));
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

  // Get product sizes from inventory
  const getProductSizes = () => {
    if (!inventoryItems || !Array.isArray(inventoryItems)) return [];

    const sizes = [];
    inventoryItems.forEach((product) => {
      if (product.sizes && Array.isArray(product.sizes)) {
        product.sizes.forEach((size) => {
          if (size.productSizeId || size.id) {
            sizes.push({
              id: size.productSizeId || size.id,
              productId: product.id,
              productName: product.name,
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
  const selectedRequest = useSelector(
    (state) => state.stockRequest.selectedRequest
  );

  // Lọc branches để chỉ lấy kho tổng (type === "central")
  const centralBranches = useMemo(() => {
    return branches.filter((branch) => branch.type === "central");
  }, [branches]);

  // Lấy tên chi nhánh nguồn từ adminInfo
  const fromBranchName = useMemo(() => {
    if (!currentBranchId) return "";
    const branch = branches.find((b) => b.id === Number(currentBranchId));
    return branch?.name || `Chi nhánh ${currentBranchId}`;
  }, [branches, currentBranchId]);

  return (
    <div className="stock-request-page min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Yêu cầu tồn kho
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Quản lý các yêu cầu nhập hàng và chuyển kho
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAllHistoryModal(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition hover:bg-gray-50"
            >
              <FaHistory /> Xem lịch sử yêu cầu
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
            >
              <FaPlus /> Tạo yêu cầu mới
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 rounded-lg bg-white p-4 shadow sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <FaSearch className="text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo mã yêu cầu..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="flex-1 border-none outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <FaFilter className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-none outline-none"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
              <option value="transferred">Đã chuyển</option>
              <option value="received">Đã nhận</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center">Đang tải...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Không có yêu cầu nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Mã yêu cầu
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Chi nhánh đích
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Trạng thái
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Số lượng sản phẩm
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Ngày tạo
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {request.code}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {request.toBranch?.name ||
                          `Chi nhánh ${request.toBranchId}`}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        {getStatusBadge(request.status)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {request.items?.length || 0} sản phẩm
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {request.createdAt
                          ? new Date(request.createdAt).toLocaleDateString(
                              "vi-VN"
                            )
                          : "N/A"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(request)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Xem chi tiết"
                          >
                            <FaEye />
                          </button>
                          <button
                            onClick={() => handleEdit(request)}
                            className="text-yellow-600 hover:text-yellow-900"
                            title="Sửa"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleViewHistory(request)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Lịch sử"
                          >
                            <FaHistory />
                          </button>
                          <button
                            onClick={() => handleDelete(request.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Xóa"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {showCreateModal && editingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Sửa yêu cầu</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingRequest(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Chi nhánh nguồn
                    </label>
                    <input
                      type="text"
                      value={
                        editingRequest
                          ? getFromBranchNameForEdit()
                          : fromBranchName
                      }
                      disabled
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {editingRequest
                        ? "Chi nhánh nguồn không thể thay đổi"
                        : "Chi nhánh nguồn được tự động lấy từ chi nhánh của bạn"}
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
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Ghi chú yêu cầu
                    </label>
                    <textarea
                      value={formData.note}
                      onChange={(e) =>
                        setFormData({ ...formData, note: e.target.value })
                      }
                      rows={2}
                      placeholder="Thông tin thêm cho yêu cầu"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">
                        Sản phẩm
                      </label>
                      <button
                        type="button"
                        onClick={addItem}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        + Thêm sản phẩm
                      </button>
                    </div>
                    {formData.items.map((item, index) => (
                      <div
                        key={index}
                        className="mb-3 flex gap-2 rounded-lg border border-gray-200 p-3"
                      >
                        <div className="flex-1">
                          <select
                            value={item.productSizeId}
                            onChange={(e) =>
                              updateItem(index, "productSizeId", e.target.value)
                            }
                            className="block w-full rounded-md border border-gray-300 px-3 py-2"
                            required
                          >
                            <option value="">Chọn sản phẩm - Size</option>
                            {productSizes.map((ps) => (
                              <option key={ps.id} value={ps.id}>
                                {ps.productName} - {ps.sizeName} (Tồn:{" "}
                                {ps.stock})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-24">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(index, "quantity", e.target.value)
                            }
                            placeholder="Số lượng"
                            className="block w-full rounded-md border border-gray-300 px-3 py-2"
                            required
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={item.note}
                            onChange={(e) =>
                              updateItem(index, "note", e.target.value)
                            }
                            placeholder="Ghi chú"
                            className="block w-full rounded-md border border-gray-300 px-3 py-2"
                          />
                        </div>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <FaTimes />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingRequest(null);
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
                  >
                    {editingRequest ? "Cập nhật" : "Tạo"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Chi tiết yêu cầu</h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    dispatch(clearSelectedRequest());
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Mã yêu cầu
                    </label>
                    <p className="text-lg font-semibold">
                      {selectedRequest.code}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Trạng thái
                    </label>
                    <div className="mt-1">
                      {getStatusBadge(selectedRequest.status)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Chi nhánh nguồn
                    </label>
                    <p>
                      {selectedRequest.fromBranch?.name ||
                        `Chi nhánh ${selectedRequest.fromBranchId}`}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Chi nhánh đích
                    </label>
                    <p>
                      {selectedRequest.toBranch?.name ||
                        `Chi nhánh ${selectedRequest.toBranchId}`}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Ngày tạo
                    </label>
                    <p>
                      {selectedRequest.createdAt
                        ? new Date(selectedRequest.createdAt).toLocaleString(
                            "vi-VN"
                          )
                        : "N/A"}
                    </p>
                  </div>
                  {selectedRequest.approvedByUser && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Người duyệt
                      </label>
                      <p>{selectedRequest.approvedByUser.fullname}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Danh sách sản phẩm
                  </label>
                  <div className="mt-2 space-y-2">
                    {selectedRequest.items?.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-gray-200 p-3"
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">
                            Sản phẩm ID: {item.productSizeId}
                          </span>
                          <span className="text-indigo-600">
                            Số lượng: {item.quantity}
                          </span>
                        </div>
                        {item.note && (
                          <p className="mt-1 text-sm text-gray-500">
                            Ghi chú: {item.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    dispatch(clearSelectedRequest());
                  }}
                  className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistoryModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Lịch sử yêu cầu</h2>
                <button
                  onClick={() => {
                    setShowHistoryModal(false);
                    dispatch(clearSelectedRequest());
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-3">
                {selectedRequest.histories?.length > 0 ? (
                  selectedRequest.histories.map((history, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 p-4"
                    >
                      <div className="flex-shrink-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                          <FaClock className="text-indigo-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900">
                            {history.action}
                          </span>
                          <span className="text-sm text-gray-500">
                            {history.createdAt
                              ? new Date(history.createdAt).toLocaleString(
                                  "vi-VN"
                                )
                              : "N/A"}
                          </span>
                        </div>
                        {history.note && (
                          <p className="mt-1 text-sm text-gray-600">
                            {history.note}
                          </p>
                        )}
                        {history.actor && (
                          <p className="mt-1 text-xs text-gray-500">
                            Thực hiện bởi: {history.actor.fullname || "N/A"}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500">Chưa có lịch sử</p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowHistoryModal(false);
                    dispatch(clearSelectedRequest());
                  }}
                  className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* All History Modal */}
        {showAllHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Lịch sử tất cả yêu cầu</h2>
                <button
                  onClick={() => setShowAllHistoryModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-3">
                {(() => {
                  // Lấy tất cả lịch sử từ tất cả requests
                  const allHistories = [];
                  requests.forEach((request) => {
                    if (request.histories && Array.isArray(request.histories)) {
                      request.histories.forEach((history) => {
                        allHistories.push({
                          ...history,
                          requestCode: request.code,
                          requestId: request.id,
                          fromBranch:
                            request.fromBranch?.name ||
                            `Chi nhánh ${request.fromBranchId}`,
                          toBranch:
                            request.toBranch?.name ||
                            `Chi nhánh ${request.toBranchId}`,
                        });
                      });
                    }
                  });

                  // Sắp xếp theo thời gian (mới nhất trước)
                  allHistories.sort((a, b) => {
                    const dateA = a.createdAt
                      ? new Date(a.createdAt)
                      : new Date(0);
                    const dateB = b.createdAt
                      ? new Date(b.createdAt)
                      : new Date(0);
                    return dateB - dateA;
                  });

                  if (allHistories.length === 0) {
                    return (
                      <p className="text-center text-gray-500 py-8">
                        Chưa có lịch sử nào
                      </p>
                    );
                  }

                  return allHistories.map((history, index) => (
                    <div
                      key={`${history.requestId}-${index}`}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex-shrink-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                          <FaClock className="text-indigo-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-semibold text-gray-900">
                              {history.action}
                            </span>
                            <span className="ml-2 text-sm text-gray-500">
                              - Mã yêu cầu:{" "}
                              <span className="font-medium text-indigo-600">
                                {history.requestCode}
                              </span>
                            </span>
                          </div>
                          <span className="text-sm text-gray-500">
                            {history.createdAt
                              ? new Date(history.createdAt).toLocaleString(
                                  "vi-VN"
                                )
                              : "N/A"}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-1">
                          <span className="font-medium">Chi nhánh đích:</span>{" "}
                          {history.toBranch}
                        </div>
                        {history.note && (
                          <p className="mt-1 text-sm text-gray-600">
                            <span className="font-medium">Ghi chú:</span>{" "}
                            {history.note}
                          </p>
                        )}
                        {history.actor && (
                          <p className="mt-1 text-xs text-gray-500">
                            Thực hiện bởi: {history.actor.fullname || "N/A"}
                          </p>
                        )}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAllHistoryModal(false)}
                  className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold">Xác nhận xóa</h3>
              <p className="mb-6 text-gray-600">
                Bạn có chắc chắn muốn xóa yêu cầu này? Hành động này không thể
                hoàn tác.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setSelectedRequestId(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  onClick={confirmDelete}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockRequestPage;
