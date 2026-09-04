import db from "../../models/index.js";
import cloudinary from "../../config/cloudinary.js";

const getAllBanner = async () => {
    try {
        let data = await db.Banner.findAll();

        if (!data || data.length === 0) {
            return {
                EM: "No active banners found",
                EC: 2,
                DT: [],
            };
        }

        return {
            EM: "Get active banners successfully",
            EC: 0,
            DT: data,
        };
    } catch (error) {
        console.error("Error while fetching active banners:", error);
        return {
            EM: "Something went wrong while fetching banners",
            EC: 1,
            DT: [],
        };
    }
};
const getAllActiveBanner = async () => {
    try {
        let data = await db.Banner.findAll({ where: { status: "active" } });

        if (!data || data.length === 0) {
            return {
                EM: "No active banners found",
                EC: 2,
                DT: [],
            };
        }

        return {
            EM: "Get active banners successfully",
            EC: 0,
            DT: data,
        };
    } catch (error) {
        console.error("Error while fetching active banners:", error);
        return {
            EM: "Something went wrong while fetching banners",
            EC: 1,
            DT: [],
        };
    }
};
const createBanner = async (bannerData) => {
    try {
        let data = await db.Banner.create(bannerData);

        return {
            EM: "create banner successful",
            EC: 0,
            DT: data,
        };
    } catch (error) {
        console.error("Lỗi khi tạo banner:", error);
        return {
            EM: "create banner fail",
            EC: 1,
            DT: null,
        };
    }
};

const updateBanner = async (id, bannerData) => {
    try {
        let banner = await db.Banner.findByPk(id);

        if (!banner) {
            return {
                EM: "Banner không tồn tại",
                EC: 2,
                DT: null,
            };
        }

        // ❌ xóa ảnh cũ nếu có ảnh mới
        if (bannerData.image && banner.image?.publicId) {
            await cloudinary.uploader.destroy(banner.image.publicId);
        }

        await banner.update(bannerData);

        return {
            EM: "Cập nhật banner thành công",
            EC: 0,
            DT: banner,
        };
    } catch (error) {
        console.error("Lỗi khi cập nhật banner:", error);
        return {
            EM: "Lỗi khi cập nhật banner",
            EC: 1,
            DT: null,
        };
    }
};

const deleteBanner = async (id) => {
    try {
        let banner = await db.Banner.findByPk(id);

        if (!banner) {
            return {
                EM: "Banner không tồn tại",
                EC: 2,
                DT: null,
            };
        }

        // ❌ xóa ảnh trên Cloudinary
        if (banner.image?.publicId) {
            await cloudinary.uploader.destroy(banner.image.publicId);
        }

        await banner.destroy();

        return {
            EM: "Xóa banner thành công",
            EC: 0,
            DT: null,
        };
    } catch (error) {
        console.error("Lỗi khi xóa banner:", error);
        return {
            EM: "Lỗi khi xóa banner",
            EC: 1,
            DT: null,
        };
    }
};

export default {
    getAllBanner,
    createBanner,
    updateBanner,
    deleteBanner,
    getAllActiveBanner,
};
