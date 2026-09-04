import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import cartController from "./cart.controller.js";
import {
    addCartItemBody,
    cartItemIdParams,
    updateCartItemBody,
    userIdParams,
} from "./cart.dto.js";

export const createCartRouter = (): Router => {
    const router = Router();

    router.get("/cart/read/:userId", verifyToken, validateRequest({ params: userIdParams }), cartController.readFunc);
    router.post("/cart/add", verifyToken, validateRequest({ body: addCartItemBody }), cartController.addFunc);
    router.put("/cart/update", verifyToken, validateRequest({ body: updateCartItemBody }), cartController.updateFunc);
    router.delete("/cart/delete/:cartProductSizeId", verifyToken, validateRequest({ params: cartItemIdParams }), cartController.deleteFunc);

    return router;
};
