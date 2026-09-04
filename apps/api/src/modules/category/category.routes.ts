import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import categoryController from "./category.controller.js";
import { categoryIdParams, createCategoryBody, updateCategoryBody } from "./category.dto.js";

export const createCategoryRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    router.post("/category/check", validateRequest({ body: createCategoryBody.pick({ name: true }) }), categoryController.checkCategoryFunc);
    router.get("/category/read", cache("category:all"), categoryController.readCategoryFunc);
    router.post("/category/create", ...managers, validateRequest({ body: createCategoryBody }), categoryController.createCategoryFunc);
    router.put("/category/update/:categoryId", ...managers, validateRequest({ params: categoryIdParams, body: updateCategoryBody }), categoryController.updateCategoryFunc);
    router.delete("/category/delete/:categoryId", ...managers, validateRequest({ params: categoryIdParams }), categoryController.deleteCategoryFunc);
    return router;
};
