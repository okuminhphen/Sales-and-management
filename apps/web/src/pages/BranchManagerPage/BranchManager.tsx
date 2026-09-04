// @ts-nocheck
import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchBranches,
  createBranchThunk,
  updateBranchThunk,
  deleteBranchThunk,
} from "../../store/slices/branchSlice";

function BranchManager({ setSelectedBranchId, setActiveTab }) {
  const dispatch = useDispatch<any>();
  const { branches, loading } = useSelector((state: any) => state.branch);
  const [showDialog, setShowDialog] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    type: "",
  });

  useEffect(() => {
    dispatch(fetchBranches());
  }, [dispatch]);

  const openAddDialog = () => {
    setIsEditing(false);
    setFormData({
      name: "",
      address: "",
      phone: "",
      email: "",
      type: "BRANCH",
    });
    setShowDialog(true);
  };

  const openEditDialog = (b) => {
    setIsEditing(true);
    setEditId(b.id);
    // Map backend type to frontend format
    let displayType = b.type;
    if (b.type === "branch" || b.type === "Chi nhánh") {
      displayType = "BRANCH";
    } else if (b.type === "central" || b.type === "Kho tổng") {
      displayType = "CENTRAL";
    }
    setFormData({
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email,
      type: displayType,
    });
    setShowDialog(true);
  };

  const closeDialog = () => setShowDialog(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    if (isEditing) {
      dispatch(
        updateBranchThunk({ branchId: editId, branchData: formData })
      ).then(() => {
        dispatch(fetchBranches());
      });
    } else {
      dispatch(createBranchThunk(formData)).then(() => {
        dispatch(fetchBranches());
      });
    }
    closeDialog();
  };

  const openConfirmDelete = (id) => {
    setDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = () => {
    dispatch(deleteBranchThunk(deleteId)).then(() => {
      dispatch(fetchBranches());
    });
    setShowConfirm(false);
    setDeleteId(null);
  };

  const cancelDelete = () => {
    setShowConfirm(false);
    setDeleteId(null);
  };

  // Hàm chuyển đổi type từ backend sang tiếng Việt để hiển thị
  const getTypeDisplay = (type) => {
    if (!type) return "";
    const typeLower = type.toLowerCase();
    if (
      typeLower === "branch" ||
      typeLower === "branches" ||
      type === "BRANCH"
    ) {
      return "Chi nhánh";
    } else if (typeLower === "central" || type === "CENTRAL") {
      return "Kho tổng";
    }
    return type; // Trả về nguyên bản nếu không khớp
  };

  const filteredBranches = branches.filter(
    (b) =>
      b?.name?.toLowerCase().includes(search.toLowerCase()) ||
      b?.address?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between bg-blue-600 p-4 rounded-t-lg text-white">
        <h1 className="text-xl font-semibold">Quản lý chi nhánh</h1>
        <button
          className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-100"
          onClick={openAddDialog}
        >
          + <span>Thêm chi nhánh</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center mx-4 my-4 border border-gray-300 rounded-lg overflow-hidden bg-white">
        <div className="w-10 text-center text-gray-500">🔍</div>
        <input
          type="text"
          placeholder="Tìm kiếm theo tên hoặc địa chỉ chi nhánh..."
          className="flex-1 px-3 py-2 outline-none text-gray-700"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="w-10 text-gray-400 text-xl hover:text-gray-600 transition"
            onClick={() => setSearch("")}
          >
            ❌
          </button>
        )}
      </div>

      {/* Table */}
      <div className="p-4">
        <table className="w-full border-collapse bg-white rounded-lg shadow-sm overflow-hidden">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-800 font-semibold">
              {[
                "ID",
                "Tên chi nhánh",
                "Địa chỉ",
                "Số điện thoại",
                "Email",
                "Loại",
                "Thao tác",
              ].map((h, i) => (
                <th key={i} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center p-4 text-gray-500 bg-gray-50"
                >
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : filteredBranches.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center p-4 text-gray-500 bg-gray-50"
                >
                  Không tìm thấy chi nhánh nào
                </td>
              </tr>
            ) : (
              filteredBranches.map((b) => (
                <tr key={b.id} className="border-t hover:bg-gray-50 transition">
                  <td className="p-3">{b.id}</td>
                  <td className="p-3">
                    <button
                      onClick={() => {
                        setSelectedBranchId(b.id);
                        setActiveTab("branch-detail");
                      }}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium focus:outline-none cursor-pointer"
                    >
                      {b.name}
                    </button>
                  </td>
                  <td className="p-3">{b.address}</td>
                  <td className="p-3">{b.phone}</td>
                  <td className="p-3">{b.email}</td>
                  <td className="p-3">{getTypeDisplay(b.type)}</td>
                  <td className="p-3">
                    <button
                      className="bg-blue-600 text-white px-3 py-1 rounded-md mr-2 hover:bg-blue-700"
                      onClick={() => openEditDialog(b)}
                    >
                      Sửa
                    </button>
                    <button
                      className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700"
                      onClick={() => openConfirmDelete(b.id)}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog thêm / sửa */}
      {showDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-start justify-center pt-8 z-50 animate-fadeIn"
          onClick={closeDialog}
        >
          <div
            className="bg-white p-6 rounded-xl w-[400px] max-w-[90%] shadow-xl animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {isEditing ? "Sửa thông tin chi nhánh" : "Thêm chi nhánh mới"}
            </h2>

            {["name", "address", "phone", "email"].map((field) => (
              <div key={field} className="mb-3">
                <label className="block mb-1 text-gray-700 text-sm font-medium">
                  {field === "name"
                    ? "Tên chi nhánh"
                    : field === "address"
                    ? "Địa chỉ"
                    : field === "phone"
                    ? "Số điện thoại"
                    : "Email"}
                </label>
                <input
                  type={field === "email" ? "email" : "text"}
                  name={field}
                  value={formData[field]}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-gray-900"
                />
              </div>
            ))}

            <div className="mb-4">
              <label className="block mb-1 text-gray-700 text-sm font-medium">
                Loại chi nhánh
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-gray-900"
              >
                <option value="BRANCH">Chi nhánh</option>
                <option value="CENTRAL">Kho tổng</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500"
                onClick={closeDialog}
              >
                Hủy
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                onClick={handleSave}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup xác nhận xóa */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-start justify-center pt-8 z-50 animate-fadeIn"
          onClick={cancelDelete}
        >
          <div
            className="bg-white p-6 rounded-xl w-[350px] shadow-xl mt-[-100px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-red-600 mb-2">
              Xác nhận xóa chi nhánh
            </h2>
            <p className="text-gray-700 mb-4 leading-relaxed text-sm">
              Bạn có chắc muốn xóa chi nhánh này không? <br />
              <b>Hành động này không thể hoàn tác.</b>
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500"
                onClick={cancelDelete}
              >
                Hủy
              </button>
              <button
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                onClick={confirmDelete}
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BranchManager;
