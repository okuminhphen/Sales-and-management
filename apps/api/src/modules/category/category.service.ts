import db from "../../models/index.js";

const getAllCategorys = async () => {
    try {
        let categorys = await db.Category.findAll(); // ✅ Đổi thành Category
        if (!categorys) {
            return {
                EM: "failed to get all categorys",
                EC: "1",
            };
        }
        return {
            EM: "get all categorys success",
            EC: "0",
            DT: categorys,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "error from category service",
            EC: "-1",
        };
    }
};

const createCategory = async (categoryData) => {
    try {
        let newCategory = await db.Category.create(categoryData); // ✅ Đổi thành Category
        return {
            EM: "create category success",
            EC: "0",
            DT: newCategory,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "error when creating category",
            EC: "-1",
        };
    }
};

const updateCategory = async (categoryId, categoryData) => {
    try {
        let category = await db.Category.findOne({ where: { id: categoryId } }); // ✅
        if (!category) {
            return {
                EM: "category not found",
                EC: "1",
            };
        }

        await category.update(categoryData);

        return {
            EM: "update category success",
            EC: "0",
            DT: category,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "error when updating category",
            EC: "-1",
        };
    }
};

const deleteCategory = async (categoryId) => {
    try {
        let category = await db.Category.findOne({ where: { id: categoryId } }); // ✅
        if (!category) {
            return {
                EM: "category not found",
                EC: "1",
            };
        }

        await category.destroy();

        return {
            EM: "delete category success",
            EC: "0",
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "error when deleting category",
            EC: "-1",
        };
    }
};

export default {
    getAllCategorys,
    createCategory,
    updateCategory,
    deleteCategory,
};
