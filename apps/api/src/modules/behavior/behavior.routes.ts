import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import behaviorController from "./behavior.controller.js";
import { productIdParams } from "./behavior.dto.js";

export const createBehaviorRouter = (): Router => {
    const router = Router();

    router.post("/behavior/view/:productId", verifyToken, validateRequest({ params: productIdParams }), behaviorController.addViewFunc);
    router.post("/behavior/like/:productId", verifyToken, validateRequest({ params: productIdParams }), behaviorController.toggleLikeFunc);
    router.get("/behavior/like-status/:productId", verifyToken, validateRequest({ params: productIdParams }), behaviorController.getLikeStatusFunc);

    return router;
};
