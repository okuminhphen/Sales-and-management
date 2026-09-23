import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import type { CartMutationV2Service } from "../../application/cart-mutation-v2.service.js";
import type { CartQueryV2Service } from "../../application/cart-query-v2.service.js";
import type { CartVariantV2Resolver } from "../../application/cart-variant-v2.resolver.js";
import { createCartV2Controller } from "./cart-v2.controller.js";
import { cartAddBodyV2, cartDeleteParamsV2, cartReadParamsV2,
    cartReadQueryV2, cartUpdateBodyV2 } from "./cart-v2.dto.js";

/** V2-compatible routes; mounted only by the later V2 composition checkpoint. */
export const createCartV2Router = (dependencies: {
    auth: RequestHandler;
    query: CartQueryV2Service;
    mutation: CartMutationV2Service;
    variants: CartVariantV2Resolver;
}): Router => {
    const router = Router();
    const controller = createCartV2Controller(dependencies);
    router.get("/cart/read/:userId", dependencies.auth,
        validateRequest({ params: cartReadParamsV2, query: cartReadQueryV2 }), controller.read);
    router.post("/cart/add", dependencies.auth, validateRequest({ body: cartAddBodyV2 }), controller.add);
    router.put("/cart/update", dependencies.auth, validateRequest({ body: cartUpdateBodyV2 }), controller.update);
    router.delete("/cart/delete/:cartProductSizeId", dependencies.auth,
        validateRequest({ params: cartDeleteParamsV2 }), controller.remove);
    return router;
};
