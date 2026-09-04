import db from "../../models/index.js";
import cloudinary from "../../config/cloudinary.js";
import { env } from "../../config/env.js";

const getProducts = async () => {
    try {
        let products = await db.Product.findAll({
            attributes: ["id", "name", "description", "price", "images"],
            include: [
                {
                    model: db.Category,
                    attributes: ["id", "name"],
                },
                {
                    model: db.Size,
                    as: "sizes",
                    attributes: ["id", "name"],
                    through: {
                        attributes: [],
                    },
                },
            ],
        });

        return { EM: "Get products success", EC: 0, DT: products };
    } catch (e) {
        console.error(e);
        return { EM: "Error", EC: 1, DT: [] };
    }
};

const getCategory = async () => {
    try {
        let data = await db.Category.findAll();

        return {
            EM: "Get category success",
            EC: 0,
            DT: data,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Failed to get category",
            EC: 1,
            DT: [],
        };
    }
};

const addNewProduct = async (data) => {
    const transaction = await db.sequelize.transaction();

    try {
        const sizes = data.sizes ? JSON.parse(data.sizes) : [];

        const product = await db.Product.create(
            {
                name: data.name,
                description: data.description,
                price: data.price,
                images: data.images || [],
                categoryId: data.categoryId,
            },
            { transaction }
        );

        // 🔥 insert product_size
        if (Array.isArray(sizes) && sizes.length > 0) {
            const productSizes = sizes.map((s) => ({
                productId: product.id,
                sizeId: s.sizeId,
                stock: s.stock,
            }));

            await db.ProductSize.bulkCreate(productSizes, { transaction });
        }

        await transaction.commit();

        return { EM: "Create success", EC: 0, DT: product };
    } catch (e) {
        await transaction.rollback();
        console.error(e);
        return { EM: "Create fail", EC: 1, DT: null };
    }
};

const updateProduct = async (id, data) => {
    const transaction = await db.sequelize.transaction();

    try {
        const product = await db.Product.findByPk(id, { transaction });
        if (!product) {
            await transaction.rollback();
            return { EM: "Product not found", EC: 1, DT: null };
        }

        const sizes = data.sizes ? JSON.parse(data.sizes) : [];

        // 🔥 update product info
        await product.update(
            {
                name: data.name,
                description: data.description,
                price: data.price,
                categoryId: data.categoryId,
                images: data.images || [],
            },
            { transaction }
        );

        // 🔥 xóa toàn bộ size cũ
        await db.ProductSize.destroy({
            where: { productId: id },
            transaction,
        });

        // 🔥 insert lại size mới
        if (Array.isArray(sizes) && sizes.length > 0) {
            const productSizes = sizes.map((s) => ({
                productId: id,
                sizeId: s.sizeId,
                stock: s.stock,
            }));

            await db.ProductSize.bulkCreate(productSizes, { transaction });
        }

        await transaction.commit();

        return { EM: "Update product success", EC: 0, DT: product };
    } catch (e) {
        await transaction.rollback();
        console.error(e);
        return { EM: "Update product fail", EC: 1, DT: null };
    }
};

const deleteProduct = async (id) => {
    try {
        const product = await db.Product.findByPk(id);
        if (!product) {
            return { EM: "Not exist", EC: 1, DT: null };
        }

        // ❌ xóa ảnh Cloudinary
        if (Array.isArray(product.images)) {
            for (const img of product.images) {
                if (img.publicId) {
                    await cloudinary.uploader.destroy(img.publicId);
                }
            }
        }

        // ❌ xóa quan hệ size
        await product.setSizes([]); // clear ProductSize

        // ❌ xóa product
        await product.destroy();

        return { EM: "Delete success", EC: 0, DT: null };
    } catch (e) {
        console.error(e);
        return { EM: "Delete fail", EC: 1, DT: null };
    }
};

const getProductById = async (idProduct) => {
    try {
        console.log(idProduct);
        const product = await db.Product.findOne({
            where: { id: idProduct },
            attributes: ["id", "name", "description", "price", "images"],
            include: [
                {
                    model: db.ProductSize,
                    as: "productSizes",
                    attributes: ["id"],
                    include: [
                        {
                            model: db.Size,
                            as: "size",
                            attributes: ["id", "name"],
                        },
                        {
                            model: db.Inventory,
                            as: "inventories",
                            attributes: ["stock"],
                            where: {
                                branchId: env.DEFAULT_FULFILLMENT_BRANCH_ID,
                            },
                            required: false,
                        },
                    ],
                },
                {
                    model: db.Category,
                    attributes: ["id", "name", "description"],
                },
            ],
        });

        if (!product) {
            return {
                EM: "Get product fail",
                EC: 2,
                DT: [],
            };
        }

        // =====================
        // 🔥 MAP DATA GỌN LẠI
        // =====================
        const raw = product.toJSON();

        const sizes = raw.productSizes.map((ps) => ({
            sizeId: ps.size.id,
            sizeName: ps.size.name,
            stock: ps.inventories?.[0]?.stock || 0,
        }));

        delete raw.productSizes;

        return {
            EM: "get product success",
            EC: 0,
            DT: {
                ...raw,
                sizes,
            },
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "something wrong :(",
            EC: 1,
            DT: [],
        };
    }
};

const getProductByCategoryId = async (categoryId) => {
    try {
        let data = await db.Product.findAll({
            where: { categoryId: categoryId },
        });
        return {
            EM: "get product by category id success",
            EC: 0,
            DT: data,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "something wrong :(",
            EC: 1,
            DT: [],
        };
    }
};
export default {
    getProducts,
    getCategory,
    addNewProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    getProductByCategoryId,
};
