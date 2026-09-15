import db from "../../models/index.js";
import cloudinary from "../../config/cloudinary.js";
import { env } from "../../config/env.js";
import { enqueueOutboxEvent } from "../../infrastructure/events/outbox.js";

const catalogPayload = (product) => {
    const value = product.toJSON();
    return {
        product_id: value.id,
        name: value.name,
        description: value.description || "",
        price: Number(value.price),
        images: value.images || [],
        category_id: value.categoryId ?? null,
    };
};

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

        await enqueueOutboxEvent({
            eventType: "catalog.product.upserted",
            aggregateType: "product",
            aggregateId: product.id,
            payload: catalogPayload(product),
            transaction,
        });

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

        // Đồng bộ biến thể theo sizeId, không xóa/tạo lại toàn bộ để giữ kho và lịch sử.
        const existingVariants = await db.ProductSize.findAll({
            where: { productId: id },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        const incomingBySize = new Map(
            (Array.isArray(sizes) ? sizes : []).map((size) => [Number(size.sizeId), size])
        );
        if (incomingBySize.size !== (Array.isArray(sizes) ? sizes.length : 0)) {
            throw new Error("Product sizes must not contain duplicate sizeId values");
        }

        for (const variant of existingVariants) {
            const incoming = incomingBySize.get(Number(variant.sizeId));
            if (incoming) {
                await variant.update({ stock: incoming.stock }, { transaction });
                incomingBySize.delete(Number(variant.sizeId));
                continue;
            }
            const [inventoryCount, cartCount, transferCount] = await Promise.all([
                db.Inventory.count({ where: { productSizeId: variant.id }, transaction }),
                db.CartProductSize.count({ where: { productSizeId: variant.id }, transaction }),
                db.TransferReceiptItem.count({ where: { productSizeId: variant.id }, transaction }),
            ]);
            if (inventoryCount || cartCount || transferCount) {
                throw new Error("Cannot remove a product size that has inventory or transaction references");
            }
            await variant.destroy({ transaction });
        }

        for (const size of incomingBySize.values()) {
            await db.ProductSize.create(
                { productId: id, sizeId: size.sizeId, stock: size.stock },
                { transaction }
            );
        }

        await enqueueOutboxEvent({
            eventType: "catalog.product.upserted",
            aggregateType: "product",
            aggregateId: product.id,
            payload: catalogPayload(product),
            transaction,
        });

        await transaction.commit();

        return { EM: "Update product success", EC: 0, DT: product };
    } catch (e) {
        await transaction.rollback();
        console.error(e);
        return { EM: "Update product fail", EC: 1, DT: null };
    }
};

const deleteProduct = async (id) => {
    const transaction = await db.sequelize.transaction();
    try {
        const product = await db.Product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!product) {
            await transaction.rollback();
            return { EM: "Not exist", EC: 1, DT: null };
        }

        const productSizes = await db.ProductSize.findAll({ where: { productId: id }, transaction });
        const variantIds = productSizes.map((item) => item.id);
        if (variantIds.length) {
            const [inventoryCount, cartCount, transferCount] = await Promise.all([
                db.Inventory.count({ where: { productSizeId: variantIds }, transaction }),
                db.CartProductSize.count({ where: { productSizeId: variantIds }, transaction }),
                db.TransferReceiptItem.count({ where: { productSizeId: variantIds }, transaction }),
            ]);
            if (inventoryCount || cartCount || transferCount) {
                await transaction.rollback();
                return { EM: "Cannot delete a product with inventory or transaction history", EC: 1, DT: null };
            }
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
        await product.setSizes([], { transaction }); // clear ProductSize

        await enqueueOutboxEvent({
            eventType: "catalog.product.deleted",
            aggregateType: "product",
            aggregateId: product.id,
            payload: { product_id: product.id },
            transaction,
        });

        // ❌ xóa product
        await product.destroy({ transaction });
        await transaction.commit();

        return { EM: "Delete success", EC: 0, DT: null };
    } catch (e) {
        await transaction.rollback();
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
