import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import type { OrderQueryV2Service } from "../../application/order-query-v2.service.js";
import { createOrderReadV2Controller } from "./order-read-v2.controller.js";
import { orderReadBranchParamsV2, orderReadDetailParamsV2, orderReadListQueryV2, orderReadUserParamsV2 } from "./order-read-v2.dto.js";

/** V2 order reads preserve legacy paths but are mounted only at the V2 cutover checkpoint. */
export const createOrderReadV2Router = (dependencies: {
    auth: RequestHandler; query: OrderQueryV2Service;
}): Router => {
    const router = Router();
    const controller = createOrderReadV2Controller(dependencies.query);
    router.get("/order/read", dependencies.auth,
        validateRequest({ query: orderReadListQueryV2 }), controller.all);
    router.get("/order/read/:userId", dependencies.auth,
        validateRequest({ params: orderReadUserParamsV2, query: orderReadListQueryV2 }), controller.own);
    router.get("/order/branch/:branchId", dependencies.auth,
        validateRequest({ params: orderReadBranchParamsV2, query: orderReadListQueryV2 }), controller.branch);
    router.get("/order/:orderId", dependencies.auth,
        validateRequest({ params: orderReadDetailParamsV2 }), controller.detail);
    return router;
};
