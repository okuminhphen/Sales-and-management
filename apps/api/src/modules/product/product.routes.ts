import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import upload from "../../middlewares/uploadCloudinary.js";
import productController from "./product.controller.js";
import {
    categoryProductQuery,
    createProductBody,
    deleteProductBody,
    productIdParams,
    recommendForUserQuery,
    recommendProductIdParams,
    updateProductBody,
} from "./product.dto.js";

export const createProductRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];

    router.get("/product/read", cache("product:all"), productController.readFunc);
    router.get("/product/recommend/:productId", validateRequest({ params: recommendProductIdParams }), cache("product:recommend"), productController.getRecommendProductsFunc);
    router.get("/recommend-product", validateRequest({ query: recommendForUserQuery }), cache("product:recommend-user"), productController.getRecommendProductsForUserFunc);
    router.get("/product/:id", validateRequest({ params: productIdParams }), cache("product"), productController.getProductFunc);
    router.post("/product/create", ...managers, upload.array("images", 5), validateRequest({ body: createProductBody }), productController.createFunc);
    router.put("/product/update/:id", ...managers, upload.array("images", 5), validateRequest({ params: productIdParams, body: updateProductBody }), productController.updateFunc);
    router.delete("/product/delete", ...managers, validateRequest({ body: deleteProductBody }), productController.deleteFunc);
    router.get("/product-by-category/read", validateRequest({ query: categoryProductQuery }), cache("product:category"), productController.getProductByCategoryFunc);

    return router;
};
