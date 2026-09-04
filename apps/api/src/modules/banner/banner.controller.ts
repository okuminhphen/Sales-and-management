import bannerService from "./banner.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";
const getActiveBanner = async (req, res) => {
    let data = await bannerService.getAllBanner();

    return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT,
    });
};
const getRealActiveBanner = async (req, res) => {
    let data = await bannerService.getAllActiveBanner();
    return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT,
    });
};

const handleUpdateBanner = async (req, res) => {
    try {
        const id = req.params.bannerId;

        let newImage = null;
        if (req.file) {
            newImage = {
                url: req.file.path,
                publicId: req.file.filename,
            };
        }

        const payload = {
            ...req.body,
        };

        if (newImage) {
            payload.image = newImage;
        }

        let data = await bannerService.updateBanner(id, payload);

        await clearCacheByPattern("banner:*");
        await clearCacheByPattern(`banner:${id}*`);

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            EM: "error",
            EC: -1,
            DT: "",
        });
    }
};

const handleCreateBanner = async (req, res) => {
    try {
        let bannerImage = null;

        if (req.file) {
            bannerImage = {
                url: req.file.path,
                publicId: req.file.filename,
            };
        }

        const payload = {
            ...req.body,
            image: bannerImage, // hoặc images nếu bạn thiết kế mảng
        };

        let data = await bannerService.createBanner(payload);

        await clearCacheByPattern("banner:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            EM: "error",
            EC: -1,
            DT: "",
        });
    }
};

const handleDeleteBanner = async (req, res) => {
    let id = req.params.bannerId;
    let data = await bannerService.deleteBanner(id);

    // Xóa cache liên quan đến banners
    await clearCacheByPattern("banner:*");
    if (id) {
        await clearCacheByPattern(`banner:${id}*`);
    }

    return res.status(200).json({
        EM: data.EM,
        EC: data.EC,
        DT: data.DT,
    });
};

export default {
    getActiveBanner,
    handleUpdateBanner,
    handleCreateBanner,
    handleDeleteBanner,
    getRealActiveBanner,
};
