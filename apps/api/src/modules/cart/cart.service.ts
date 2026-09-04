import db from "../../models/index.js";

const getUserCartById = async (userId) => {
    try {
        if (!userId || isNaN(Number(userId))) {
            return { EC: 1, EM: "userId không hợp lệ!", DT: [] };
        }

        const user = await db.User.findByPk(Number(userId));
        if (!user) {
            return { EC: 1, EM: "Không tìm thấy người dùng!", DT: [] };
        }

        // Tìm hoặc tạo giỏ hàng cho người dùng
        let [cart] = await db.Cart.findOrCreate({
            where: { userId: userId },
            defaults: {},
            attributes: ["id", "userId"],
        });

        // Lấy tất cả các mục trong giỏ hàng với thông tin sản phẩm và kích thước
        const cartProductSizes = await db.CartProductSize.findAll({
            where: { cartId: cart.id },
            attributes: ["id", "cartId", "productSizeId", "quantity"],
            raw: true,
        });

        if (!cartProductSizes || cartProductSizes.length === 0) {
            return { EC: 0, EM: "Giỏ hàng trống", DT: [] };
        }

        // Bước 2: Lấy danh sách productSizeId
        const productSizeIds = cartProductSizes.map(
            (item) => item.productSizeId
        );

        // Bước 3: Lấy thông tin ProductSize riêng
        const productSizes = await db.ProductSize.findAll({
            where: { id: productSizeIds },
            attributes: ["id", "productId", "sizeId", "stock"],
            raw: true,
        });

        // Bước 4: Lấy danh sách productId và sizeId
        const productIds = [
            ...new Set(productSizes.map((item) => item.productId)),
        ];
        const sizeIds = [...new Set(productSizes.map((item) => item.sizeId))];

        // Bước 5: Lấy thông tin Product riêng
        const products = await db.Product.findAll({
            where: { id: productIds },
            attributes: ["id", "name", "price", "images"],
            raw: true,
        });

        // Bước 6: Lấy thông tin Size riêng
        const sizes = await db.Size.findAll({
            where: { id: sizeIds },
            attributes: ["id", "name"],
            raw: true,
        });

        // Bước 7: Ghép các thông tin lại với nhau
        const formattedCartItems = cartProductSizes
            .map((cartItem) => {
                const productSize = productSizes.find(
                    (ps) => ps.id === cartItem.productSizeId
                );
                if (!productSize) return null;

                const product = products.find(
                    (p) => p.id === productSize.productId
                );
                const size = sizes.find((s) => s.id === productSize.sizeId);

                return {
                    id: cartItem.id,
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    images: product.images,
                    size: size.name,
                    quantity: cartItem.quantity,
                };
            })
            .filter((item) => item !== null);

        return {
            EC: 0,
            EM: "Lấy thông tin giỏ hàng thành công!",
            DT: formattedCartItems,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "error from service", // error message
            EC: "-1", //error code
            DT: "", // Data
        };
    }
};

const addProductToCart = async (cartItem) => {
    try {
        let { id: productId, userId, sizeId, quantity } = cartItem;

        if (!userId || !productId || !sizeId || !quantity) {
            return { EC: 1, EM: "Thiếu thông tin sản phẩm!", DT: [] };
        }
        const user = await db.User.findByPk(userId);
        if (!user) {
            return { EC: 1, EM: "Người dùng không tồn tại!", DT: [] };
        }

        // Kiểm tra sản phẩm có tồn tại không
        const product = await db.Product.findByPk(productId);
        if (!product) {
            return { EC: 1, EM: "Sản phẩm không tồn tại!" };
        }

        // Kiểm tra size có tồn tại không
        const size = await db.Size.findByPk(sizeId);
        if (!size) {
            return { EC: 1, EM: "Size không tồn tại!" };
        }

        const productSize = await db.ProductSize.findOne({
            where: {
                productId: productId,
                sizeId: sizeId,
            },
            attributes: ["id"],
            raw: true,
        });

        if (!productSize) {
            return { EC: 1, EM: "Không tìm thấy productSize!" };
        }

        let [cart] = await db.Cart.findOrCreate({
            where: { userId: userId },
            defaults: {},
            attributes: ["id", "userId"], // Chỉ lấy những cột hợp lệ
        });
        // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa

        let cartItemRecord = await db.CartProductSize.findOne({
            attributes: ["cartId", "productSizeId", "quantity"],
            where: {
                cartId: cart.id,
                productSizeId: productSize.id,
            },
        });

        if (cartItemRecord) {
            // Nếu đã có, cập nhật số lượng
            await cartItemRecord.update({
                quantity: cartItemRecord.quantity + quantity,
            });
        } else {
            // Nếu chưa có, thêm mới
            await db.CartProductSize.create({
                cartId: cart.id,
                productSizeId: productSize.id,
                quantity: quantity,
            });
        }
        return { EC: 0, EM: "Thêm vào giỏ hàng thành công!", DT: cart };
    } catch (e) {
        console.log(e);
        return {
            EM: "error from service", // error message
            EC: "-1", //error code
            DT: "", // Date
        };
    }
};

const updateProductInCart = async (cartItem, userId) => {
    try {
        const quantity = Number(cartItem.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return { EC: 1, EM: "Số lượng không hợp lệ!", DT: null };
        }

        const cart = await db.Cart.findOne({ where: { userId } });
        if (!cart) {
            return { EC: 1, EM: "Không tìm thấy giỏ hàng!", DT: null };
        }

        const record = await db.CartProductSize.findOne({
            where: { id: cartItem.cartProductSizeId, cartId: cart.id },
        });
        if (!record) {
            return { EC: 1, EM: "Sản phẩm không thuộc giỏ hàng!", DT: null };
        }

        await record.update({ quantity });
        return { EC: 0, EM: "Cập nhật số lượng thành công!", DT: record };
    } catch (e) {
        console.log(e);
        return {
            EM: "error from service", // error message
            EC: "-1", //error code
            DT: "", // Date
        };
    }
};
const deleteProductInCart = async (cartProductSizeId, userId) => {
    try {
        const cart = await db.Cart.findOne({ where: { userId } });
        if (!cart) {
            return { EC: 1, EM: "Không tìm thấy giỏ hàng!", DT: null };
        }

        const data = await db.CartProductSize.destroy({
            where: { id: cartProductSizeId, cartId: cart.id },
        });
        if (!data) {
            return { EC: 1, EM: "Sản phẩm không thuộc giỏ hàng!", DT: null };
        }
        return { EC: 0, EM: "Xóa sản phẩm thành công!", DT: data };
    } catch (e) {
        console.log(e);
        return {
            EM: "error from service", // error message
            EC: "-1", //error code
            DT: "", // Date
        };
    }
};
export default {
    getUserCartById,
    addProductToCart,
    updateProductInCart,
    deleteProductInCart,
};

