// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaBoxOpen, FaLayerGroup, FaSearch, FaWarehouse } from "react-icons/fa";
import { fetchInventoryByBranch } from "../../store/slices/inventorySlice";

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "0 ₫";
  }
  return numeric.toLocaleString("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });
};

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

  // ✅ Cloudinary image object
  if (typeof image === "object" && image.url) {
    return image.url;
  }

  // ⚠️ fallback cho data cũ (nếu có)
  if (typeof image === "string") {
    return image;
  }

  return "";
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

const InventoryPage = () => {
  const dispatch = useDispatch<any>();
  const { adminInfo } = useSelector((state: any) => state.admin);

  // Lấy branchId từ adminInfo (Redux hoặc sessionStorage)
  const getAdminBranchId = () => {
    if (adminInfo?.branchId) {
      return String(adminInfo.branchId);
    }
    // Fallback: lấy từ sessionStorage nếu Redux chưa có
    try {
      const storedAdmin = sessionStorage.getItem("adminInfo");
      if (storedAdmin) {
        const parsed = JSON.parse(storedAdmin);
        return parsed?.branchId ? String(parsed.branchId) : null;
      }
    } catch (error) {
      console.error("Error reading adminInfo from sessionStorage:", error);
    }
    return null;
  };

  const adminBranchId = getAdminBranchId();

  const {
    items,
    status,
    error: inventoryError,
  } = useSelector((state: any) => state.inventory);
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    if (adminBranchId) {
      dispatch(fetchInventoryByBranch(adminBranchId));
    }
  }, [dispatch, adminBranchId]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const keyword = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const productName = item?.name?.toLowerCase() || "";
      const descriptionText = item?.description?.toString().toLowerCase() || "";
      const sizeMatch =
        Array.isArray(item?.sizes) &&
        item.sizes.some((sizeEntry) =>
          (sizeEntry?.sizeName || sizeEntry?.name || "")
            .toLowerCase()
            .includes(keyword)
        );
      return (
        productName.includes(keyword) ||
        descriptionText.includes(keyword) ||
        sizeMatch
      );
    });
  }, [items, searchTerm]);

  const expandedInventory = useMemo(() => {
    if (!Array.isArray(filteredProducts)) return [];

    return filteredProducts.flatMap((product, productIndex) => {
      const sizeEntries =
        Array.isArray(product.sizes) && product.sizes.length > 0
          ? product.sizes
          : [{ sizeName: "--", stock: product.stock || 0 }];

      return sizeEntries.map((sizeEntry, index) => ({
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        productImages: product.images,
        productDescription: product.description,
        sizeId: `${product.id}-${sizeEntry.sizeId || sizeEntry.id || index}`,
        sizeName:
          sizeEntry.sizeName || sizeEntry.name || sizeEntry.size?.name || "--",
        stock:
          Number(sizeEntry.stock || sizeEntry.inventories?.[0]?.stock) || 0,
        isFirstRow: index === 0,
        totalSizes: sizeEntries.length,
        rowGroupIndex: productIndex,
      }));
    });
  }, [filteredProducts]);

  const totalStock = useMemo(() => {
    return expandedInventory.reduce((sum, item) => sum + (item.stock || 0), 0);
  }, [expandedInventory]);

  const isInventoryLoading = status === "loading";
  const combinedError = inventoryError;

  return (
    <div className="min-h-screen rounded-[24px] bg-slate-50 p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-600">
            <FaWarehouse />
          </span>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Quản lý tồn kho
            </h2>
            <p className="text-sm text-slate-500">
              Theo dõi số lượng tồn theo từng size tại mỗi chi nhánh.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          {/* {adminBranchId && (
            <div className="rounded-2xl border border-indigo-100 bg-white/70 px-5 py-3 text-sm text-slate-600 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Chi nhánh đang quản lý
              </p>
              <p className="text-lg font-semibold text-slate-900">
                Chi nhánh ID: {adminBranchId}
              </p>
            </div>
          )} */}

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50">
            <FaSearch className="text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo sản phẩm hoặc size..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-56 flex-1 border-none bg-transparent text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-indigo-600 transition hover:text-indigo-500"
              >
                Xóa
              </button>
            )}
          </div>
        </div>
      </div>

      {!adminBranchId && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Không tìm thấy thông tin chi nhánh. Vui lòng đăng nhập lại.
        </div>
      )}

      {combinedError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {combinedError}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-md shadow-slate-200">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-xl text-violet-600">
            <FaLayerGroup />
          </span>
          <div>
            <p className="text-sm text-slate-500">Tổng mẫu size</p>
            <p className="text-2xl font-semibold text-slate-900">
              {expandedInventory.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-md shadow-slate-200">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-xl text-sky-600">
            <FaBoxOpen />
          </span>
          <div>
            <p className="text-sm text-slate-500">Tổng tồn kho</p>
            <p className="text-2xl font-semibold text-slate-900">
              {totalStock}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/70">
        {isInventoryLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">
            Đang tải dữ liệu...
          </div>
        ) : expandedInventory.length === 0 ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-slate-500">
            {searchTerm
              ? "Không tìm thấy sản phẩm phù hợp."
              : "Chưa có dữ liệu tồn kho cho chi nhánh này."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 text-left">Sản phẩm</th>
                  <th className="px-6 py-4 text-left">Mô tả</th>
                  <th className="px-6 py-4 text-left">Giá</th>
                  <th className="px-6 py-4 text-right">Size</th>
                  <th className="px-6 py-4 text-right">Tồn kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {expandedInventory.map((item) => {
                  const images = parseImages(item?.productImages);
                  const thumbnail = images.length > 0 ? images[0] : "";
                  const descriptions = parseDescription(
                    item?.productDescription
                  );
                  const displayedDescriptions = descriptions.slice(0, 2);
                  return (
                    <tr
                      key={`${item.productId}-${item.sizeId}`}
                      className="hover:bg-slate-50/80"
                    >
                      {item.isFirstRow && (
                        <td
                          className="px-6 py-4 align-top"
                          rowSpan={item.totalSizes}
                        >
                          <div className="flex items-center gap-4">
                            {thumbnail ? (
                              <img
                                src={getImageUrl(thumbnail)}
                                alt={item?.productName || "product"}
                                className="h-14 w-14 rounded-2xl object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                <FaBoxOpen />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">
                                {item?.productName || "Không xác định"}
                              </p>
                              <p className="text-xs text-slate-500">
                                Mã: {item?.productId || "---"}
                              </p>
                            </div>
                          </div>
                        </td>
                      )}
                      {item.isFirstRow && (
                        <td
                          className="px-6 py-4 text-sm text-slate-600 align-top"
                          rowSpan={item.totalSizes}
                        >
                          {displayedDescriptions.length > 0 ? (
                            <div className="space-y-1">
                              {displayedDescriptions.map((desc, idx) => (
                                <div key={`${item.productId}-desc-${idx}`}>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    {desc.title || `Mô tả ${idx + 1}`}
                                  </p>
                                  <p className="text-sm text-slate-600">
                                    {desc.content || "Không có nội dung"}
                                  </p>
                                </div>
                              ))}
                              {descriptions.length >
                                displayedDescriptions.length && (
                                <p className="text-xs text-slate-400">
                                  +
                                  {descriptions.length -
                                    displayedDescriptions.length}{" "}
                                  mô tả khác
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs italic text-slate-400">
                              Không có mô tả
                            </span>
                          )}
                        </td>
                      )}
                      {item.isFirstRow && (
                        <td
                          className="px-6 py-4 text-slate-700"
                          rowSpan={item.totalSizes}
                        >
                          {formatCurrency(item?.productPrice)}
                        </td>
                      )}
                      <td className="px-6 py-4 text-right font-semibold text-slate-800">
                        {item?.sizeName || "--"}
                      </td>
                      <td className="px-6 py-4 text-right text-lg font-semibold text-indigo-600">
                        {Number(item?.stock) || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryPage;
