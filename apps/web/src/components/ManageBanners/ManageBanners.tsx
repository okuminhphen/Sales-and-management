// @ts-nocheck
import React, { useEffect, useState } from "react";
import { FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import { toast } from "react-toastify";
import {
  getActiveBannerService,
  createBannerService,
  updateBannerService,
  deleteBanner,
} from "../../services/bannerService";

const ManageBanners = () => {
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    status: "active",
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleImageChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      setImages([]);
      setPreviews([]);
      return;
    }

    // Chỉ dùng 1 ảnh cho mỗi banner (field "banner" trên backend)
    setImages([file]);
    setPreviews([URL.createObjectURL(file)]);
  };

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const response = await getActiveBannerService();

      const parsed = response.data.DT.map((banner) => ({
        ...banner,
        image:
          typeof banner.image === "string"
            ? JSON.parse(banner.image)
            : banner.image,
      }));

      setBanners(parsed);
    } catch (error) {
      console.error("Lỗi khi lấy banner:", error);
      toast.error("Không thể lấy danh sách banner.");
    } finally {
      setLoading(false);
    }
  };

  const filteredBanners = banners.filter((banner) =>
    banner.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddEdit = (banner = null) => {
    if (banner) {
      setFormData({
        name: banner.name,
        url: banner.url,
        status: banner.status,
      });
      // Preview ảnh đang lưu (Cloudinary) - lấy từ banner.image.url
      setPreviews(banner.image?.url ? [banner.image.url] : []);
    } else {
      setFormData({
        name: "",
        url: "",
        status: "active",
      });
      setPreviews([]);
    }
    setImages([]);
    setSelectedBanner(banner);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Tạo FormData giống như bên Products, gửi trực tiếp file cho endpoint /banner/create | /banner/update
      const payload = new FormData();
      payload.append("name", formData.name);
      payload.append("url", formData.url);
      payload.append("status", formData.status);

      // Nếu có chọn ảnh mới thì gửi field "banner" (phù hợp upload.single("banner"))
      if (images[0]) {
        payload.append("banner", images[0]);
      }

      if (selectedBanner) {
        await updateBannerService(selectedBanner.id, payload);
        toast.success("Cập nhật banner thành công!");
      } else {
        await createBannerService(payload);
        toast.success("Thêm banner mới thành công!");
      }

      await fetchBanners();
      setShowModal(false);
      setImages([]);
      setPreviews([]);
    } catch (error) {
      console.error("Lỗi khi lưu banner:", error);
      toast.error("Không thể lưu banner.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (banner) => {
    setSelectedBanner(banner);
    setShowDeleteModal(true);
  };

  const handleDelete = async (id) => {
    try {
      setLoading(true);
      let response = await deleteBanner(selectedBanner.id);
      if (!response && !response.data) {
        toast.error("Fail to delete");
        return;
      }
      await fetchBanners();
      toast.success("Xóa banner thành công!");
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Lỗi khi xóa banner:", error);
      toast.error("Không thể xóa banner.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-5">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold m-0">Quản lý Banner</h3>
          <button
            type="button"
            onClick={() => handleAddEdit()}
            className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 border border-white/30 rounded-md px-3 py-2 text-sm font-medium"
          >
            <FaPlus />
            Thêm Banner
          </button>
        </div>

        <div className="px-6 py-4">
          {/* Thanh tìm kiếm */}
          <div className="mb-4">
            <div className="flex w-full max-w-xl items-center gap-2">
              <input
                type="text"
                placeholder="Tìm kiếm theo tên banner..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Bảng danh sách banner */}
          {loading ? (
            <div className="text-center py-8">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="mt-2 text-sm text-gray-600">Đang tải dữ liệu...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên Banner
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ảnh
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredBanners.length > 0 ? (
                    filteredBanners.map((banner, index) => {
                      return (
                        <tr key={banner.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {banner.name}
                          </td>
                          <td className="px-4 py-3">
                            {banner.image?.url ? (
                              <img
                                src={banner.image.url}
                                alt={banner.name}
                                className="w-[100px] h-[50px] object-cover rounded"
                              />
                            ) : (
                              <span className="text-sm text-gray-500">
                                Không có ảnh
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-blue-700 break-all">
                            {banner.url}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                banner.status === "active"
                                  ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
                                  : "inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                              }
                            >
                              {banner.status === "active"
                                ? "Đang hiển thị"
                                : "Ẩn"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50 px-3 py-1 text-sm"
                                onClick={() => handleAddEdit(banner)}
                                title="Sửa"
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-red-600 text-red-600 hover:bg-red-50 px-3 py-1 text-sm"
                                onClick={() => handleDeleteClick(banner)}
                                title="Xóa"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-4 py-6 text-center text-sm text-gray-600"
                      >
                        Không tìm thấy banner nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal thêm/sửa banner */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-lg shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">
                {selectedBanner ? "Sửa Banner" : "Thêm Banner Mới"}
              </h3>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowModal(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên Banner
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Nhập tên banner"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ảnh Banner
                  </label>
                  <input
                    type="file"
                    name="banner"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {previews.length > 0 && (
                    <div className="mt-2">
                      <small className="text-gray-600">Ảnh đã chọn:</small>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {previews.map((preview, index) => (
                          <img
                            key={index}
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            className="w-[100px] h-[50px] object-cover rounded"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL
                  </label>
                  <input
                    type="text"
                    name="url"
                    placeholder="Nhập URL"
                    value={formData.url}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trạng thái
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Đang hiển thị</option>
                    <option value="inactive">Ẩn</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setShowModal(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {selectedBanner ? "Cập nhật" : "Thêm mới"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-lg shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Xác nhận xóa</h3>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowDeleteModal(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700">
                Bạn có chắc chắn muốn xóa banner "{selectedBanner?.name}"?
              </p>
              {selectedBanner?.image?.url && (
                <div className="mt-3">
                  <small className="text-gray-600">Ảnh banner sẽ bị xóa:</small>
                  <div className="mt-2">
                    <img
                      src={selectedBanner.image.url}
                      alt={selectedBanner.name}
                      className="w-[200px] h-[100px] object-cover rounded"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setShowDeleteModal(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleDelete(selectedBanner?.id)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageBanners;
