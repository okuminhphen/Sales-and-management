import db from "../../models/index.js";
const addView = async (userId, productId) => {
    try {
        const [record, created] = await db.UserBehavior.findOrCreate({
            where: { userId, productId },
            defaults: { viewCount: 1 },
        });

        if (!created) {
            record.viewCount += 1;
            await record.save();
        }

        return {
            EM: "View count updated",
            EC: 0,
            DT: record,
        };
    } catch (err) {
        console.error("Error in addView service:", err);
        return {
            EM: "Server error",
            EC: 1,
            DT: [],
        };
    }
};

const toggleLike = async (userId, productId) => {
    try {
        const [record] = await db.UserBehavior.findOrCreate({
            where: { userId, productId },
            defaults: { isLiked: true },
        });

        record.isLiked = !record.isLiked;
        await record.save();

        return {
            EM: record.isLiked ? "Liked product" : "Unliked product",
            EC: 0,
            DT: record,
        };
    } catch (err) {
        console.error("Error in toggleLike service:", err);
        return {
            EM: "Server error",
            EC: 1,
            DT: [],
        };
    }
};

const getLikeStatus = async (userId, productId) => {
    try {
        const record = await db.UserBehavior.findOne({
            where: { userId, productId },
        });

        // Chỉ trả true/false
        return record ? record.isLiked : false;
    } catch (err) {
        console.error("Error in getLikeStatus service:", err);
        throw err; // ném lỗi để controller xử lý
    }
};
export default { addView, toggleLike, getLikeStatus };
