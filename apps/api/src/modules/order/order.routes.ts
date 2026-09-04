import { Router } from "express";
import { cache } from "../../middlewares/cache.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { checkRole } from "../../middlewares/roleMiddleware.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import orderController from "./order.controller.js";
import {
    branchIdParams,
    createInStoreOrderBody,
    createOrderBody,
    deleteOrderBody,
    orderIdParams,
    updateOrderBody,
    updateOrderStatusBody,
    userIdParams,
} from "./order.dto.js";

export const createOrderRouter = (): Router => {
    const router = Router();
    const managers = [verifyToken, checkRole("SUPER_ADMIN", "BRANCH_MANAGER")];

    router.get("/order/read", ...managers, cache("order:all"), orderController.readFunc);
    router.get("/order/read/:userId", verifyToken, validateRequest({ params: userIdParams }), cache("order:user"), orderController.readByUserIdFunc);
    router.get("/order/branch/:branchId", ...managers, validateRequest({ params: branchIdParams }), cache("order:branch"), orderController.readByBranchIdFunc);
    router.post("/order/create", verifyToken, validateRequest({ body: createOrderBody }), orderController.createFunc);
    router.post("/order/in-store", ...managers, validateRequest({ body: createInStoreOrderBody }), orderController.createAtBranchFunc);
    router.put("/order/update", ...managers, validateRequest({ body: updateOrderBody }), orderController.updateFunc);
    router.put("/order/details/update/:orderId", verifyToken, validateRequest({ params: orderIdParams, body: updateOrderStatusBody }), orderController.updateStatusFunc);
    router.delete("/order/delete", ...managers, validateRequest({ body: deleteOrderBody }), orderController.deleteFunc);

    return router;
};
