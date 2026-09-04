import db from "../../models/index.js";

const getInventoryByBranch = async (branchId) => {
    try {
        console.log(branchId);
        const inventories = await db.Inventory.findAll({
            where: { branchId },
            attributes: ["id", "stock"],
            include: [
                {
                    model: db.ProductSize,
                    as: "productSize",
                    attributes: ["id"],
                    include: [
                        {
                            model: db.Product,
                            as: "product",
                            attributes: [
                                "id",
                                "name",
                                "price",
                                "images",
                                "description",
                            ],
                        },
                        {
                            model: db.Size,
                            as: "size",
                            attributes: ["id", "name"],
                        },
                    ],
                },
            ],
        });
        // Gộp dữ liệu theo product
        const productMap = {};

        inventories.forEach((inv) => {
            const ps = inv.productSize;
            if (!ps || !ps.product) return;

            const product = ps.product;

            if (!productMap[product.id]) {
                productMap[product.id] = {
                    id: product.id,
                    name: product.name,
                    description: product.description,
                    price: product.price,
                    images: product.images,
                    sizes: [],
                };
            }

            productMap[product.id].sizes.push({
                productSizeId: ps.id,
                sizeId: ps.size?.id,
                sizeName: ps.size?.name,
                stock: inv.stock,
            });
        });

        return {
            EC: 0,
            EM: "Get inventory by branch success",
            DT: Object.values(productMap),
        };
    } catch (e) {
        console.error(e);
        return { EC: 1, EM: "Error", DT: [] };
    }
};

export default {
    getInventoryByBranch,
};
