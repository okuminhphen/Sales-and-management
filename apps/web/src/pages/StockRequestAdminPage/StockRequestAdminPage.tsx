// @ts-nocheck
import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchPendingStockRequests,
  approveStockRequestThunk,
  rejectStockRequestThunk,
} from "../../store/slices/stockRequestSlice";
import { fetchBranches } from "../../store/slices/branchSlice";
import {
  FaEye,
  FaCheck,
  FaTimes,
  FaSearch,
  FaFilter,
  FaBuilding,
} from "react-icons/fa";
import "./StockRequestAdminPage.scss";

const StockRequestAdminPage = () => {
  const dispatch = useDispatch<any>();
  const { requests, loading } = useSelector((state: any) => state.stockRequest);
  const { branches } = useSelector((state: any) => state.branch);
  const { adminInfo } = useSelector((state: any) => state.admin);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectErrorModal, setShowRejectErrorModal] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [branchFilter, setBranchFilter] = useState("all");
  const [approveRequestId, setApproveRequestId] = useState(null);
  useEffect(() => {
    dispatch(fetchPendingStockRequests());
    dispatch(fetchBranches());
  }, [dispatch]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    let filtered = (requests || []).filter(
      (req) => req && typeof req === "object" && req.id && req.code
    );

    if (searchCode.trim()) {
      filtered = filtered.filter((req) =>
        req.code?.toLowerCase().includes(searchCode.toLowerCase().trim())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }

    if (branchFilter !== "all") {
      filtered = filtered.filter(
        (req) => req.fromBranchId === Number(branchFilter)
      );
    }

    return filtered;
  }, [requests, searchCode, statusFilter, branchFilter]);

  // Get status badge
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
      rejected: {
        bg: "bg-red-100",
        text: "text-red-800",
        label: "Đã từ chối",
      },
    };
    const statusInfo = statusMap[status] || {
      bg: "bg-gray-100",
      text: "text-gray-800",
      label: status,
    };
    return (
      <span
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}
      >
        {statusInfo.label}
      </span>
    );
  };

  const handleViewDetail = (request) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  const handleApprove = (requestId) => {
    setApproveRequestId(requestId);
    setShowApproveModal(true);
  };

  const handleConfirmApprove = async () => {
    if (approveRequestId) {
      await dispatch(approveStockRequestThunk(approveRequestId));
      setShowApproveModal(false);
      setApproveRequestId(null);
      dispatch(fetchPendingStockRequests());
    }
  };

  const handleReject = (request) => {
    setSelectedRequest(request);
    setRejectNote("");
    setShowRejectModal(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedRequest) return;
    if (!rejectNote.trim()) {
      setShowRejectErrorModal(true);
      return;
    }
    await dispatch(
      rejectStockRequestThunk({
        id: selectedRequest.id,
        note: rejectNote,
      })
    );
    setShowRejectModal(false);
    setSelectedRequest(null);
    setRejectNote("");
    dispatch(fetchPendingStockRequests());
  };

  const getBranchName = (branchId) => {
    if (!branchId) return "N/A";
    const branch = branches.find((b) => b.id === Number(branchId));
    return branch?.name || `Chi nhánh ${branchId}`;
  };

  return (
    <div className="stock-request-admin-page min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Quản lý yêu cầu tồn kho
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Duyệt và quản lý tất cả yêu cầu tồn kho từ các chi nhánh
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 rounded-lg bg-white p-4 shadow sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <FaSearch className="text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo mã yêu cầu..."
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
              <option value="rejected">Đã từ chối</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <FaBuilding className="text-gray-400" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="border-none outline-none"
            >
              <option value="all">Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          {loading ? (
            <div className="py-12 text-center text-gray-500">
              Đang tải danh sách yêu cầu...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              Không có yêu cầu nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Mã yêu cầu
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Chi nhánh gửi
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Chi nhánh nhận
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Trạng thái
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Số sản phẩm
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
                        {getBranchName(request.fromBranchId)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {getBranchName(request.toBranchId)}
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
                          {request.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(request.id)}
                                className="text-green-600 hover:text-green-900"
                                title="Duyệt"
                              >
                                <FaCheck />
                              </button>
                              <button
                                onClick={() => handleReject(request)}
                                className="text-red-600 hover:text-red-900"
                                title="Từ chối"
                              >
                                <FaTimes />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {showDetailModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  Chi tiết yêu cầu {selectedRequest.code}
                </h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedRequest(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Chi nhánh gửi
                    </label>
                    <p className="mt-1 text-gray-900">
                      {getBranchName(selectedRequest.fromBranchId)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Chi nhánh nhận
                    </label>
                    <p className="mt-1 text-gray-900">
                      {getBranchName(selectedRequest.toBranchId)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Trạng thái
                    </label>
                    <p className="mt-1">
                      {getStatusBadge(selectedRequest.status)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Ngày tạo
                    </label>
                    <p className="mt-1 text-gray-900">
                      {selectedRequest.createdAt
                        ? new Date(selectedRequest.createdAt).toLocaleString(
                            "vi-VN"
                          )
                        : "N/A"}
                    </p>
                  </div>
                </div>

                {selectedRequest.note && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Ghi chú
                    </label>
                    <p className="mt-1 text-gray-900">{selectedRequest.note}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Danh sách sản phẩm
                  </label>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                            Sản phẩm
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                            Size
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                            Số lượng
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                            Ghi chú
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {selectedRequest.items?.map((item, index) => {
                          console.log("ITEM:", item.productSize.product.name);

                          return (
                            <tr key={index}>
                              <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900">
                                {item.productSize.product.name || "N/A"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                                {item?.productSize?.size?.name || "N/A"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-gray-900">
                                {item.quantity}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {item.note || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedRequest(null);
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Đóng
                </button>
                {selectedRequest.status === "pending" && (
                  <>
                    <button
                      onClick={() => handleApprove(selectedRequest.id)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                    >
                      Duyệt yêu cầu
                    </button>
                    <button
                      onClick={() => handleReject(selectedRequest)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      Từ chối
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Approve Modal */}
        {showApproveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Duyệt yêu cầu</h2>
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setApproveRequestId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Bạn có chắc muốn duyệt yêu cầu này không?
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Hệ thống sẽ tự động tạo phiếu chuyển kho và cập nhật tồn kho.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setApproveRequestId(null);
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmApprove}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  Xác nhận duyệt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Error Modal */}
        {showRejectErrorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-red-600">Lỗi</h2>
                <button
                  onClick={() => {
                    setShowRejectErrorModal(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Vui lòng nhập lý do từ chối
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowRejectErrorModal(false);
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Từ chối yêu cầu</h2>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedRequest(null);
                    setRejectNote("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Mã yêu cầu: <strong>{selectedRequest.code}</strong>
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lý do từ chối <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={4}
                  placeholder="Nhập lý do từ chối yêu cầu..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedRequest(null);
                    setRejectNote("");
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmReject}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockRequestAdminPage;
