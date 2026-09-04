import productService from "./product.service.js";
import axios from "axios";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";
import { env } from "../../config/env.js";

const readFunc = async (req, res) => {
    try {
        let data = await productService.getProducts();
        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Date
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error get products", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const createFunc = async (req, res) => {
    try {
        const images = (req.files || []).map((file) => ({
            url: file.path,
            publicId: file.filename,
        }));

        const payload = {
            ...req.body,
            images,
        };

        let data = await productService.addNewProduct(payload);

        await clearCacheByPattern("product:*");
        await clearCacheByPattern("category:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: -1,
            DT: "",
        });
    }
};

const updateFunc = async (req, res) => {
    try {
        const id = req.params.id;
        const newImages = (req.files || []).map((file) => ({
            url: file.path,
            publicId: file.filename,
        }));

        const payload = {
            ...req.body,
        };

        if (newImages.length > 0) {
            payload.images = newImages;
        }
        let data = await productService.updateProduct(id, payload);

        await clearCacheByPattern("product:*");
        await clearCacheByPattern(`product:${id}*`);

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error",
            EC: "-1",
            DT: "",
        });
    }
};

const deleteFunc = async (req, res) => {
    try {
        let data = await productService.deleteProduct(req.body.id);

        // Xóa cache liên quan đến products
        await clearCacheByPattern("product:*");
        if (req.body.id) {
            await clearCacheByPattern(`product:${req.body.id}*`);
        }

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const readCategoryFunc = async (req, res) => {
    try {
        let data = await productService.getCategory();
        if (data) {
            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: data.DT, // Date
            });
        } else {
            return res.status(500).json({
                EM: "error get products", // error message
                EC: "2", //error code
                DT: "", // Date
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const getProductFunc = async (req, res) => {
    try {
        const { id } = req.params;
        let data = await productService.getProductById(id);
        if (data) {
            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: data.DT, // Date
            });
        } else {
            return res.status(500).json({
                EM: "error get products", // error message
                EC: "2", //error code
                DT: "", // Date
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const getProductByCategoryFunc = async (req, res) => {
    try {
        const categoryId = req.query.categoryId;

        let data = await productService.getProductByCategoryId(categoryId);
        if (data) {
            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: data.DT, // Date
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const getRecommendProductsFunc = async (req, res) => {
    const { productId } = req.params;

    try {
        // Gọi Flask API
        const response = await axios.get(
            `${env.AI_SERVICE_URL}/recommend/${productId}`
        );

        // Trả về dữ liệu cho frontend
        return res.json({
            EM: "get recommend products successful",
            EC: 0,
            DT: response.data,
        });
    } catch (error) {
        console.error("Lỗi gọi Flask:", error.message);
        return res.status(500).json({
            success: false,
            message: "Không thể lấy gợi ý sản phẩm từ AI service",
        });
    }
};

const getRecommendProductsForUserFunc = async (req, res) => {
    const userId = req.query.userId;

    const num = req.query.num || 10;
    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }
    try {
        // Gọi Flask API
        const response = await axios.get(
            `${env.AI_SERVICE_URL}/recommend-product-for-user`,
            {
                params: { userId, num },
            }
        );

        const { recommendations } = response.data;

        // Trả về dữ liệu cho frontend
        return res.json({
            EM: "get recommend products for user successful",
            EC: 0,
            DT: recommendations || [],
        });
    } catch (error) {
        console.error("Lỗi gọi Flask:", error.message);
        return res.status(500).json({
            success: false,
            message: "Không thể lấy gợi ý sản phẩm từ AI service",
        });
    }
};

export default {
    readFunc,
    readCategoryFunc,
    updateFunc,
    deleteFunc,
    getProductFunc,
    createFunc,
    getProductByCategoryFunc,
    getRecommendProductsFunc,
    getRecommendProductsForUserFunc,
};
