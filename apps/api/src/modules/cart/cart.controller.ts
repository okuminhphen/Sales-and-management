import cartService from "./cart.service.js";
const readFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: [] });
        }

        let data = await cartService.getUserCartById(userId);
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
            EM: "error read cart", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

const addFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }
        let cartItem = { ...req.body, userId };
        let data = await cartService.addProductToCart(cartItem);
        if (data) {
            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: data.DT, // Date
            });
        } else {
            return res.status(500).json({
                EM: "fail add to cart", // error message
                EC: "2", //error code
                DT: "", // Date
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error add to cart", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const updateFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }
        let cartItem = req.body;

        let data = await cartService.updateProductInCart(cartItem, userId);
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
            EM: "error update cart", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const deleteFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }
        let cartProductSizeId = req.params.cartProductSizeId;

        let data = await cartService.deleteProductInCart(cartProductSizeId, userId);

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Date
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error delete cart", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
export default { readFunc, addFunc, updateFunc, deleteFunc };
