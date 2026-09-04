import behaviorService from "./behavior.service.js";

const addViewFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }

        const { productId } = req.params;

        const response = await behaviorService.addView(userId, productId);
        return res.status(200).json(response);
    } catch (error) {
        console.error("Error in addView:", error);
        return res.status(500).json({
            EM: "Internal server error",
            EC: 1,
            DT: [],
        });
    }
};

const toggleLikeFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }
        const { productId } = req.params;

        const response = await behaviorService.toggleLike(
            userId,
            productId
        );
        return res.status(200).json(response);
    } catch (error) {
        console.error("Error in toggleLike:", error);
        return res.status(500).json({
            EM: "Internal server error",
            EC: 1,
            DT: [],
        });
    }
};

const getLikeStatusFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;

        const { productId } = req.params;
        if (!userId || !productId) {
            return res.status(400).json({
                EC: 1,
                EM: "Missing userId or productId",
                DT: null,
            });
        }
        const response = await behaviorService.getLikeStatus(
            userId,
            productId
        );
        return res.status(200).json({
            EC: 0,
            EM: "Get like status success",
            DT: response,
        });
    } catch (error) {
        console.error("Error get like status:", error);
        return res.status(500).json({
            EM: "Internal server error",
            EC: 1,
            DT: [],
        });
    }
};

export default {
    addViewFunc,
    toggleLikeFunc,
    getLikeStatusFunc,
};
