// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FiEdit3,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiShield,
  FiX,
} from "react-icons/fi";
import {
  createAdminAccountThunk,
  deleteAdminAccountThunk,
  fetchAdminAccounts,
  updateAdminAccountThunk,
} from "../../store/slices/adminAccountSlice";
import { fetchBranches } from "../../store/slices/branchSlice";
import { getAllRoles } from "../../services/roleService";

const DEFAULT_FORM = {
  username: "",
  email: "",
  fullname: "",
  phone: "",
  roleId: "",
  branchId: "",
  status: "ACTIVE",
  password: "",
};

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100";

const AdminAccountManagementPage = () => {
  const dispatch = useDispatch<any>();
  const { list, loading, saving, deletingId } = useSelector(
    (state) => state.adminAccounts
  );
  const { branches, loading: branchLoading } = useSelector(
    (state) => state.branch
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [formValues, setFormValues] = useState(DEFAULT_FORM);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchAdminAccounts());
    dispatch(fetchBranches());
  }, [dispatch]);

  useEffect(() => {
    const loadRoles = async () => {
      setRoleLoading(true);
      try {
        const roleRes = await getAllRoles();
        if (+roleRes?.data?.EC === 0) {
          const onlyBranchManagers = (roleRes.data.DT || []).filter(
            (role) => role.name === "BRANCH_MANAGER"
          );
          setRoles(onlyBranchManagers);
        }
      } catch (error) {
        console.error("Failed to load roles", error);
      } finally {
        setRoleLoading(false);
      }
    };

    loadRoles();
  }, []);

  useEffect(() => {
    if (!roles.length) return;
    setFormValues((prev) => {
      if (formMode === "create" && !prev.roleId) {
        return { ...prev, roleId: roles[0].id.toString() };
      }
      return prev;
    });
  }, [roles, formMode]);

  const branchMap = useMemo(() => {
    const map = {};
    branches?.forEach((branch) => {
      map[branch.id] = branch;
    });
    return map;
  }, [branches]);

  const filteredAdmins = useMemo(() => {
    // Lọc bỏ SUPER_ADMIN trước
    const nonSuperAdmins = list.filter(
      (admin) => admin.role?.name !== "SUPER_ADMIN"
    );

    if (!searchTerm.trim()) return nonSuperAdmins;
    const lower = searchTerm.toLowerCase();
    return nonSuperAdmins.filter((admin) => {
      return (
        admin.username?.toLowerCase().includes(lower) ||
        admin.email?.toLowerCase().includes(lower) ||
        admin.fullname?.toLowerCase().includes(lower)
      );
    });
  }, [list, searchTerm]);

  const openCreateModal = () => {
    setFormMode("create");
    setFormValues({
      ...DEFAULT_FORM,
      roleId: roles[0]?.id?.toString() || "",
    });
    setSelectedAdmin(null);
    setIsFormOpen(true);
  };

  const openEditModal = (admin) => {
    setFormMode("edit");
    setSelectedAdmin(admin);
    setFormValues({
      username: admin.username || "",
      email: admin.email || "",
      fullname: admin.fullname || "",
      phone: admin.phone || "",
      roleId: admin.role?.id?.toString() || "",
      branchId: admin.branchId ? admin.branchId.toString() : "",
      status: admin.status || "ACTIVE",
      password: "",
    });
    setIsFormOpen(true);
  };

  const openDeleteModal = (admin) => {
    setSelectedAdmin(admin);
    setIsDeleteOpen(true);
  };

  const closeFormModal = () => {
    setIsFormOpen(false);
    setSelectedAdmin(null);
    setFormValues(DEFAULT_FORM);
  };

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setSelectedAdmin(null);
  };

  const handleInputChange = (field, value) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      username: formValues.username.trim(),
      email: formValues.email.trim(),
      fullname: formValues.fullname.trim(),
      phone: formValues.phone.trim(),
      roleId: formValues.roleId ? Number(formValues.roleId) : null,
      branchId: formValues.branchId ? Number(formValues.branchId) : null,
      status: formValues.status,
    };

    if (formMode === "create") {
      payload.password = formValues.password;
    } else if (formValues.password) {
      payload.password = formValues.password;
    }

    try {
      if (formMode === "create") {
        await dispatch(createAdminAccountThunk(payload)).unwrap();
      } else if (selectedAdmin) {
        await dispatch(
          updateAdminAccountThunk({ id: selectedAdmin.id, data: payload })
        ).unwrap();
      }

      closeFormModal();
      dispatch(fetchAdminAccounts());
    } catch (error) {
      console.error(error);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedAdmin) return;
    try {
      await dispatch(deleteAdminAccountThunk(selectedAdmin.id)).unwrap();
      closeDeleteModal();
      dispatch(fetchAdminAccounts());
    } catch (error) {
      console.error(error);
    }
  };

  const renderStatusBadge = (status) => {
    const isActive = status === "ACTIVE";
    const classes = isActive
      ? "bg-green-50 text-green-700 border-green-100"
      : "bg-rose-50 text-rose-600 border-rose-100";
    return (
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}
      >
        {isActive ? "Hoạt động" : "Tạm khóa"}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                <FiShield />
                <span>Quản lý tài khoản admin</span>
              </div>
              {(roleLoading || branchLoading) && (
                <p className="mt-2 text-xs text-gray-400">
                  Đang tải danh sách Role/Chi nhánh...
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              <div className="relative w-full min-w-[240px] flex-1 sm:w-auto">
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm theo tên, email, username..."
                  className={`${inputClasses} pl-11`}
                />
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
              >
                <FiPlus />
                <span>Thêm admin</span>
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-gray-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-4">#</th>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">Họ tên</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">SĐT</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Chi nhánh</th>
                    <th className="px-6 py-4">Trạng thái</th>
                    <th className="px-6 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-6 py-10 text-center text-sm text-gray-500"
                      >
                        <div className="flex items-center justify-center gap-3">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
                          Đang tải danh sách admin...
                        </div>
                      </td>
                    </tr>
                  ) : filteredAdmins.length ? (
                    filteredAdmins.map((admin, index) => (
                      <tr key={admin.id} className="hover:bg-gray-50/80">
                        <td className="px-6 py-4 text-xs font-semibold text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {admin.username}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {admin.fullname || "—"}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {admin.email}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {admin.phone || "—"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {admin.role?.name || "Chưa gán"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {branchMap[admin.branchId]?.name ||
                            (admin.branchId
                              ? `Branch #${admin.branchId}`
                              : "None")}
                        </td>
                        <td className="px-6 py-4">
                          {renderStatusBadge(admin.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(admin)}
                              className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100"
                            >
                              <FiEdit3 />
                              Sửa
                            </button>
                            <button
                              onClick={() => openDeleteModal(admin)}
                              disabled={deletingId === admin.id}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <FiTrash2 />
                              {deletingId === admin.id ? "Đang xóa..." : "Xóa"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-6 py-10 text-center text-sm text-gray-500"
                      >
                        Không tìm thấy tài khoản phù hợp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 text-sm text-gray-500">
              Hiển thị {filteredAdmins.length} /{" "}
              {
                list.filter((admin) => admin.role?.name !== "SUPER_ADMIN")
                  .length
              }{" "}
              tài khoản
            </div>
          </div>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {formMode === "create"
                    ? "Thêm tài khoản admin"
                    : "Chỉnh sửa tài khoản"}
                </p>
                <p className="text-sm text-gray-500">
                  Điền thông tin chi tiết cho tài khoản quản trị.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50"
              >
                <FiX />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Username
                  </label>
                  <input
                    className={`${inputClasses} mt-2`}
                    value={formValues.username}
                    onChange={(e) =>
                      handleInputChange("username", e.target.value)
                    }
                    placeholder="superadmin"
                    required
                    disabled={formMode === "edit"}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Email
                  </label>
                  <input
                    type="email"
                    className={`${inputClasses} mt-2`}
                    value={formValues.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="admin@example.com"
                    required
                    disabled={formMode === "edit"}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Họ và tên
                  </label>
                  <input
                    className={`${inputClasses} mt-2`}
                    value={formValues.fullname}
                    onChange={(e) =>
                      handleInputChange("fullname", e.target.value)
                    }
                    placeholder="Nguyễn Văn A"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Số điện thoại
                  </label>
                  <input
                    className={`${inputClasses} mt-2`}
                    value={formValues.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="098xxxxxxx"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Role
                  </label>
                  <select
                    className={`${inputClasses} mt-2`}
                    value={formValues.roleId}
                    onChange={(e) =>
                      handleInputChange("roleId", e.target.value)
                    }
                  >
                    <option value="">Chọn quyền hạn</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Chi nhánh
                  </label>
                  <select
                    className={`${inputClasses} mt-2`}
                    value={formValues.branchId}
                    onChange={(e) =>
                      handleInputChange("branchId", e.target.value)
                    }
                  >
                    <option value="">Chưa gán chi nhánh</option>
                    {branches?.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name || `Branch #${branch.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Trạng thái
                  </label>
                  <select
                    className={`${inputClasses} mt-2`}
                    value={formValues.status}
                    onChange={(e) =>
                      handleInputChange("status", e.target.value)
                    }
                  >
                    <option value="ACTIVE">Hoạt động</option>
                    <option value="INACTIVE">Tạm khóa</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">
                    Mật khẩu
                  </label>
                  <input
                    type="password"
                    className={`${inputClasses} mt-2`}
                    value={formValues.password}
                    onChange={(e) =>
                      handleInputChange("password", e.target.value)
                    }
                    placeholder={
                      formMode === "create"
                        ? "Nhập mật khẩu"
                        : "Để trống nếu giữ nguyên"
                    }
                    required={formMode === "create"}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={closeFormModal}
                className="rounded-2xl border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-white"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {formMode === "create" ? "Tạo mới" : "Cập nhật"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
                <FiTrash2 />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  Xóa tài khoản admin
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Bạn có chắc chắn muốn xóa tài khoản{" "}
                  <span className="font-semibold text-gray-800">
                    {selectedAdmin?.username}
                  </span>{" "}
                  không? Thao tác này không thể hoàn tác.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500"
              >
                <FiTrash2 />
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccountManagementPage;
