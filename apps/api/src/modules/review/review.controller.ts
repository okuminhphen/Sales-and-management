import reviewService from "./review.service.js";
const addReviewFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }
        const { productId, rating, comment } = req.body;
        const review = await reviewService.addReview({
            productId,
            userId,
            rating,
            comment,
        });
        res.status(201).json({
            EM: review.EM,
            EC: review.EC,
            DT: review.DT,
        });
    } catch (error) {
        res.status(500).json({
            EM: error.message,
            EC: -1,
            DT: [],
        });
    }
};

const getReviewsByProductIdFunc = async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await reviewService.getReviewsByProductId(productId);
        res.status(200).json({
            EM: reviews.EM,
            EC: reviews.EC,
            DT: reviews.DT,
        });
    } catch (error) {
        res.status(500).json({
            EM: error.message,
            EC: -1,
            DT: [],
        });
    }
};

export default {
    addReviewFunc,
    getReviewsByProductIdFunc,
};
