import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import upload from "../../middlewares/uploadCloudinary.js";
import bannerController from "./banner.controller.js";
import { bannerBody, bannerIdParams, updateBannerBody } from "./banner.dto.js";

export const createBannerRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];
    router.get("/banner/read", cache("banner:all"), bannerController.getActiveBanner);
    router.get("/banner/read/active", cache("banner:active"), bannerController.getRealActiveBanner);
    router.post("/banner/create", ...managers, upload.single("banner"), validateRequest({ body: bannerBody }), bannerController.handleCreateBanner);
    router.put("/banner/update/:bannerId", ...managers, upload.single("banner"), validateRequest({ params: bannerIdParams, body: updateBannerBody }), bannerController.handleUpdateBanner);
    router.delete("/banner/delete/:bannerId", ...managers, validateRequest({ params: bannerIdParams }), bannerController.handleDeleteBanner);
    return router;
};
