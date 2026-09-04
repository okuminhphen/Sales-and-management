import db from "../../models/index.js";

const addReview = async (reviewData) => {
    try {
        const { productId, userId, rating, comment } = reviewData;

        // Tạo đánh giá mới
        const review = await db.Review.create({
            productId,
            userId,
            rating,
            reviewText: comment,
        });

        return {
            EM: "Add review successfully",
            EC: 0,
            DT: review,
        };
    } catch (error) {
        console.log("Error when adding review:", error);
        return {
            EM: error.message || "Something went wrong",
            EC: -1,
            DT: null,
        };
    }
};

const getReviewsByProductId = async (productId) => {
    try {
        const reviews = await db.Review.findAll({
            where: { productId },
            include: [
                {
                    model: db.User,
                    as: "user",
                    attributes: ["username"], // Chỉ lấy username
                },
            ],
        });
        return {
            EM: "Get reviews by product id successfully",
            EC: 0,
            DT: reviews,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: error.message,
            EC: -1,
            DT: [],
        };
    }
};

export default { addReview, getReviewsByProductId };
