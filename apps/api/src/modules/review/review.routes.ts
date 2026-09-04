import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import reviewController from "./review.controller.js";
import { addReviewBody, productIdParams } from "./review.dto.js";

export const createReviewRouter = (): Router => {
    const router = Router();
    router.post("/review/add", verifyToken, validateRequest({ body: addReviewBody }), reviewController.addReviewFunc);
    router.get("/review/product/:productId", validateRequest({ params: productIdParams }), reviewController.getReviewsByProductIdFunc);
    return router;
};
