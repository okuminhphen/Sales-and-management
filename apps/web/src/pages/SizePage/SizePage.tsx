// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaPlus, FaEdit, FaTrash, FaSearch } from "react-icons/fa";
import { toast } from "react-toastify";
import {
  fetchSizes,
  createSizeThunk,
  updateSizeThunk,
  deleteSizeThunk,
} from "../../store/slices/sizeSlice";

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin text-blue-600"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    ></path>
  </svg>
);

const ModalWrapper = ({ title, children, onClose, footer }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h4 className="text-lg font-semibold text-gray-900">{title}</h4>
        <button
          onClick={onClose}
          className="text-gray-400 transition hover:text-gray-600"
        >
          ✕
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
      <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
        {footer}
      </div>
    </div>
  </div>
);

const actionButtonClasses =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

const SizePage = () => {
  const dispatch = useDispatch<any>();
  const { sizes, status, error, mutationStatus } = useSelector(
    (state) => state.size
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const [formValue, setFormValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchSizes());
    }
  }, [status, dispatch]);

  const filteredSizes = useMemo(() => {
    if (!Array.isArray(sizes)) return [];
    return sizes.filter((size) =>
      size.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sizes, searchTerm]);

  const handleOpenCreate = () => {
    setFormValue("");
    setShowCreateModal(true);
  };

  const handleOpenEdit = (size) => {
    setSelectedSize(size);
    setFormValue(size.name);
    setShowEditModal(true);
  };

  const handleOpenDelete = (size) => {
    setSelectedSize(size);
    setShowDeleteModal(true);
  };

  const resetModalState = () => {
    setSelectedSize(null);
    setFormValue("");
    setIsSubmitting(false);
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
  };

  const handleSubmitCreate = async () => {
    if (!formValue.trim()) {
      toast.error("Tên size không được để trống");
      return;
    }
    setIsSubmitting(true);
    try {
      await dispatch(
        createSizeThunk({
          name: formValue.trim(),
        })
      ).unwrap();
      toast.success("Thêm size thành công");
      resetModalState();
    } catch (err) {
      toast.error(err?.EM || "Không thể thêm size");
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!formValue.trim()) {
      toast.error("Tên size không được để trống");
      return;
    }
    if (!selectedSize) return;
    setIsSubmitting(true);
    try {
      await dispatch(
        updateSizeThunk({
          id: selectedSize.id,
          name: formValue.trim(),
        })
      ).unwrap();
      toast.success("Cập nhật size thành công");
      resetModalState();
    } catch (err) {
      toast.error(err?.EM || "Không thể cập nhật size");
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedSize) return;
    setIsSubmitting(true);
    try {
      await dispatch(deleteSizeThunk(selectedSize.id)).unwrap();
      toast.success("Xóa size thành công");
      resetModalState();
    } catch (err) {
      toast.error(err?.EM || "Không thể xóa size");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="rounded-2xl bg-white shadow-xl shadow-blue-900/5">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-gray-900">
                Quản lý size
              </h3>
              <p className="text-sm text-gray-500">
                Theo dõi, tạo mới, chỉnh sửa và xóa kích cỡ sản phẩm.
              </p>
            </div>
            <button
              className={`${actionButtonClasses} bg-blue-600 text-white hover:bg-blue-500`}
              onClick={handleOpenCreate}
            >
              <FaPlus className="mr-2" />
              Thêm size
            </button>
          </div>

          <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              <span className="px-3 text-gray-400">
                <FaSearch />
              </span>
              <input
                className="flex-1 bg-transparent py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
                placeholder="Tìm kiếm theo tên size..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="px-4 text-sm font-medium text-gray-500 transition hover:text-gray-700"
                  onClick={() => setSearchTerm("")}
                >
                  Xóa
                </button>
              )}
            </div>

            <div className="min-h-[24px] text-sm">
              {status === "loading" && (
                <span className="flex items-center gap-2 text-gray-500">
                  <Spinner /> Đang tải dữ liệu...
                </span>
              )}
              {status === "failed" && (
                <span className="text-red-500">
                  {error || "Không thể tải danh sách size"}
                </span>
              )}
              {mutationStatus === "loading" && (
                <span className="flex items-center gap-2 text-blue-600">
                  <Spinner /> Đang xử lý...
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto px-6 py-5">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="border-b border-gray-100 pb-3">ID</th>
                  <th className="border-b border-gray-100 pb-3">Tên size</th>
                  <th className="border-b border-gray-100 pb-3 text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSizes.length > 0 ? (
                  filteredSizes.map((size) => (
                    <tr
                      key={size.id}
                      className="text-sm text-gray-700 transition hover:bg-gray-50"
                    >
                      <td className="border-b border-gray-50 py-4 font-medium text-gray-900">
                        {size.id}
                      </td>
                      <td className="border-b border-gray-50 py-4 capitalize">
                        {size.name}
                      </td>
                      <td className="border-b border-gray-50 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            className={`${actionButtonClasses} border border-blue-100 bg-blue-50 text-blue-600 hover:border-blue-200`}
                            onClick={() => handleOpenEdit(size)}
                          >
                            <FaEdit />
                          </button>
                          <button
                            className={`${actionButtonClasses} border border-red-100 bg-red-50 text-red-600 hover:border-red-200`}
                            onClick={() => handleOpenDelete(size)}
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-10 text-center text-sm text-gray-500"
                    >
                      {status === "loading"
                        ? "Đang tải danh sách size..."
                        : "Không tìm thấy size nào"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <ModalWrapper
          title="Thêm size mới"
          onClose={resetModalState}
          footer={
            <>
              <button
                className={`${actionButtonClasses} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                onClick={resetModalState}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                className={`${actionButtonClasses} bg-blue-600 text-white hover:bg-blue-500`}
                onClick={handleSubmitCreate}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang lưu..." : "Thêm"}
              </button>
            </>
          }
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
            Tên size
            <input
              type="text"
              placeholder="Nhập tên size (ví dụ: S, M, L...)"
              className="rounded-xl border border-gray-200 px-4 py-2 text-gray-800 outline-none transition focus:border-blue-400"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
            />
          </label>
        </ModalWrapper>
      )}

      {showEditModal && (
        <ModalWrapper
          title="Chỉnh sửa size"
          onClose={resetModalState}
          footer={
            <>
              <button
                className={`${actionButtonClasses} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                onClick={resetModalState}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                className={`${actionButtonClasses} bg-blue-600 text-white hover:bg-blue-500`}
                onClick={handleSubmitEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </>
          }
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
            Tên size
            <input
              type="text"
              placeholder="Nhập tên size"
              className="rounded-xl border border-gray-200 px-4 py-2 text-gray-800 outline-none transition focus:border-blue-400"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
            />
          </label>
        </ModalWrapper>
      )}

      {showDeleteModal && (
        <ModalWrapper
          title="Xóa size"
          onClose={resetModalState}
          footer={
            <>
              <button
                className={`${actionButtonClasses} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                onClick={resetModalState}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                className={`${actionButtonClasses} bg-red-600 text-white hover:bg-red-500`}
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang xóa..." : "Xóa"}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            Bạn có chắc chắn muốn xóa size{" "}
            <span className="font-semibold text-gray-900">
              {selectedSize?.name}
            </span>
            ? Hành động này không thể hoàn tác.
          </p>
        </ModalWrapper>
      )}
    </div>
  );
};

export default SizePage;
