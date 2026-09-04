// @ts-nocheck
import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchTransferReceipts,
  fetchTransferReceiptDetail,
  approveTransferReceiptThunk,
  rejectTransferReceiptThunk,
  cancelTransferReceiptThunk,
} from "../../store/slices/transferReceiptSlice";
import { fetchBranches } from "../../store/slices/branchSlice";
import {
  FaEye,
  FaCheck,
  FaTimes,
  FaSearch,
  FaFilter,
  FaBuilding,
  FaBan,
} from "react-icons/fa";
import "./TransferReceiptPage.scss";

const TransferReceiptPage = () => {
  const dispatch = useDispatch<any>();
  const { receipts, loading, selectedReceipt } = useSelector(
    (state) => state.transferReceipt
  );
  const { branches } = useSelector((state: any) => state.branch);
  const { adminInfo } = useSelector((state: any) => state.admin);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");

  useEffect(() => {
    dispatch(fetchTransferReceipts());
    dispatch(fetchBranches());
  }, [dispatch]);

  // Filter receipts
  const filteredReceipts = useMemo(() => {
    let filtered = (receipts || []).filter(
      (receipt) =>
        receipt && typeof receipt === "object" && receipt.id && receipt.code
    );

    if (searchCode.trim()) {
      filtered = filtered.filter((receipt) =>
        receipt.code?.toLowerCase().includes(searchCode.toLowerCase().trim())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((receipt) => receipt.status === statusFilter);
    }

    if (branchFilter !== "all") {
      filtered = filtered.filter(
        (receipt) =>
          receipt.fromBranchId === Number(branchFilter) ||
          receipt.toBranchId === Number(branchFilter)
      );
    }

    return filtered;
  }, [receipts, searchCode, statusFilter, branchFilter]);

  // Get status badge
  const getStatusBadge = (status) => {
    const statusMap = {
      pending: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        label: "Chờ duyệt",
      },
      approved: {
        bg: "bg-blue-100",
        text: "text-blue-800",
        label: "Đã duyệt",
      },
      rejected: {
        bg: "bg-red-100",
        text: "text-red-800",
        label: "Đã từ chối",
      },
      cancelled: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        label: "Đã hủy",
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

  const handleViewDetail = async (receipt) => {
    await dispatch(fetchTransferReceiptDetail(receipt.id));
    setShowDetailModal(true);
  };

  const handleApprove = () => {
    setShowApproveModal(true);
  };

  const handleConfirmApprove = async () => {
    if (!selectedReceipt || !adminInfo?.adminId) return;
    await dispatch(
      approveTransferReceiptThunk(selectedReceipt.id)
    );
    setShowApproveModal(false);
    dispatch(fetchTransferReceipts());
    if (showDetailModal) {
      await dispatch(fetchTransferReceiptDetail(selectedReceipt.id));
    }
  };

  const handleReject = () => {
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedReceipt || !adminInfo?.adminId) return;
    if (!rejectReason.trim()) {
      return;
    }
    await dispatch(
      rejectTransferReceiptThunk({
        id: selectedReceipt.id,
        reason: rejectReason,
      })
    );
    setShowRejectModal(false);
    setRejectReason("");
    dispatch(fetchTransferReceipts());
    if (showDetailModal) {
      await dispatch(fetchTransferReceiptDetail(selectedReceipt.id));
    }
  };

  const handleCancel = () => {
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedReceipt || !adminInfo?.adminId) return;
    await dispatch(
      cancelTransferReceiptThunk(selectedReceipt.id)
    );
    setShowCancelModal(false);
    dispatch(fetchTransferReceipts());
    if (showDetailModal) {
      await dispatch(fetchTransferReceiptDetail(selectedReceipt.id));
    }
  };

  // Kiểm tra xem user có phải người tạo phiếu không
  const canCancel = (receipt) => {
    if (!receipt || !adminInfo) return false;
    return (
      receipt.status === "pending" && receipt.createdBy === adminInfo.adminId
    );
  };

  const getBranchName = (branchId) => {
    if (!branchId) return "N/A";
    const branch = branches.find((b) => b.id === Number(branchId));
    return branch?.name || `Chi nhánh ${branchId}`;
  };

  return (
    <div className="transfer-receipt-page min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Phiếu chuyển kho</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý và theo dõi tất cả phiếu chuyển kho giữa các chi nhánh
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 rounded-lg bg-white p-4 shadow sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <FaSearch className="text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo mã phiếu..."
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
              <option value="cancelled">Đã hủy</option>
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
              Đang tải danh sách phiếu chuyển kho...
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              Không có phiếu chuyển kho nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Mã phiếu
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
                      Ngày tạo
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredReceipts.map((receipt) => (
                    <tr
                      key={receipt.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleViewDetail(receipt)}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {receipt.code}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {getBranchName(receipt.fromBranchId)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {getBranchName(receipt.toBranchId)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        {getStatusBadge(receipt.status)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {receipt.createdAt
                          ? new Date(receipt.createdAt).toLocaleDateString(
                              "vi-VN"
                            )
                          : "N/A"}
                      </td>
                      <td
                        className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(receipt)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Xem chi tiết"
                          >
                            <FaEye />
                          </button>
                          {receipt.status === "pending" && (
                            <>
                              <button
                                onClick={() => {
                                  dispatch(
                                    fetchTransferReceiptDetail(receipt.id)
                                  );
                                  setTimeout(() => handleApprove(), 100);
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                                title="Duyệt"
                              >
                                <FaCheck />
                                <span>Duyệt</span>
                              </button>
                              <button
                                onClick={() => {
                                  dispatch(
                                    fetchTransferReceiptDetail(receipt.id)
                                  );
                                  setTimeout(() => handleReject(), 100);
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                                title="Từ chối"
                              >
                                <FaTimes />
                                <span>Từ chối</span>
                              </button>
                            </>
                          )}
                          {canCancel(receipt) && (
                            <button
                              onClick={() => {
                                dispatch(
                                  fetchTransferReceiptDetail(receipt.id)
                                );
                                setTimeout(() => handleCancel(), 100);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                              title="Hủy"
                            >
                              <FaBan />
                              <span>Hủy</span>
                            </button>
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
        {showDetailModal && selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  Chi tiết phiếu chuyển kho {selectedReceipt.code}
                </h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
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
                      {getBranchName(selectedReceipt.fromBranchId)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Chi nhánh nhận
                    </label>
                    <p className="mt-1 text-gray-900">
                      {getBranchName(selectedReceipt.toBranchId)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Trạng thái
                    </label>
                    <p className="mt-1">
                      {getStatusBadge(selectedReceipt.status)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Ngày tạo
                    </label>
                    <p className="mt-1 text-gray-900">
                      {selectedReceipt.createdAt
                        ? new Date(selectedReceipt.createdAt).toLocaleString(
                            "vi-VN"
                          )
                        : "N/A"}
                    </p>
                  </div>
                </div>

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
                        {selectedReceipt.items?.map((item, index) => (
                          <tr key={index}>
                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900">
                              {item.productSize?.product?.name || "N/A"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500">
                              {item.productSize?.size?.name || "N/A"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-gray-900">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {item.note || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedReceipt.histories &&
                  selectedReceipt.histories.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Lịch sử thay đổi
                      </label>
                      <div className="space-y-2">
                        {selectedReceipt.histories.map((history, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-gray-200 p-3"
                          >
                            <div className="flex justify-between">
                              <span className="font-medium">
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Đóng
                </button>
                {selectedReceipt.status === "pending" && (
                  <>
                    <button
                      onClick={handleApprove}
                      className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                    >
                      Duyệt phiếu
                    </button>
                    <button
                      onClick={handleReject}
                      className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      Từ chối
                    </button>
                  </>
                )}
                {canCancel(selectedReceipt) && (
                  <button
                    onClick={handleCancel}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
                  >
                    Hủy phiếu
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Approve Modal */}
        {showApproveModal && selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Duyệt phiếu chuyển kho</h2>
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Bạn có chắc muốn duyệt phiếu chuyển kho{" "}
                  <strong>{selectedReceipt.code}</strong> không?
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Hệ thống sẽ tự động trừ kho ở chi nhánh gửi và cộng kho ở chi
                  nhánh nhận.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowApproveModal(false);
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

        {/* Reject Modal */}
        {showRejectModal && selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Từ chối phiếu chuyển kho</h2>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Mã phiếu: <strong>{selectedReceipt.code}</strong>
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lý do từ chối <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Nhập lý do từ chối phiếu chuyển kho..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason("");
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmReject}
                  disabled={!rejectReason.trim()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancelModal && selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Hủy phiếu chuyển kho</h2>
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Bạn có chắc muốn hủy phiếu chuyển kho{" "}
                  <strong>{selectedReceipt.code}</strong> không?
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Hành động này không thể hoàn tác. Phiếu chuyển kho sẽ được
                  đánh dấu là đã hủy.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                  }}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Không
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
                >
                  Xác nhận hủy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransferReceiptPage;
