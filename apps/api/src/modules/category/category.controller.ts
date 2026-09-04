import categoryService from "./category.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";
const readCategoryFunc = async (req, res) => {
    try {
        let data = await categoryService.getAllCategorys();
        console.log(data);
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const createCategoryFunc = async (req, res) => {
    try {
        const categoryData = req.body;
        console.log(categoryData);
        let data = await categoryService.createCategory(categoryData);

        // Xóa cache liên quan đến categories và products
        await clearCacheByPattern("category:*");
        await clearCacheByPattern("product:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};
const updateCategoryFunc = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const categoryData = req.body;

        let data = await categoryService.updateCategory(
            categoryId,
            categoryData
        );

        // Xóa cache liên quan đến categories và products
        await clearCacheByPattern("category:*");
        await clearCacheByPattern("product:*");
        if (categoryId) {
            await clearCacheByPattern(`category:${categoryId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};
const deleteCategoryFunc = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;

        let data = await categoryService.deleteCategory(categoryId);
        console.log(data);

        // Xóa cache liên quan đến categories và products
        await clearCacheByPattern("category:*");
        await clearCacheByPattern("product:*");
        if (categoryId) {
            await clearCacheByPattern(`category:${categoryId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const checkCategoryFunc = (req, res) => {};

export default {
    readCategoryFunc,
    createCategoryFunc,
    updateCategoryFunc,
    deleteCategoryFunc,
    checkCategoryFunc,
};
