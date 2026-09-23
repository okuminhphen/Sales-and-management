import type { RequestHandler } from "express";
import { serializeEntityId } from "../../../../shared/contracts/database-scalars.js";
import type { CartMutationV2Service } from "../../application/cart-mutation-v2.service.js";
import type { CartQueryV2Service } from "../../application/cart-query-v2.service.js";
import type { CartVariantV2Resolver } from "../../application/cart-variant-v2.resolver.js";
import type { V2AuthenticatedRequest } from "../../../identity-access/interfaces/http/v2-auth.middleware.js";

export const createCartV2Controller = (dependencies: {
    query: CartQueryV2Service;
    mutation: CartMutationV2Service;
    variants: CartVariantV2Resolver;
}): { read: RequestHandler; add: RequestHandler; update: RequestHandler; remove: RequestHandler } => {
    const contextOf = (request: Parameters<RequestHandler>[0]) =>
        (request as V2AuthenticatedRequest).v2AccessContext;

    return {
        read: async (request, response) => {
            const context = contextOf(request);
            if (!context) return void response.status(401).json({ EM: "Authentication required", EC: 3, DT: [] });
            // The legacy URL contains a userId, but ownership is exclusively DB-derived.
            const result = await dependencies.query.getOwnCart(context, request.query);
            switch (result.kind) {
                case "cart":
                    response.status(200).json({
                        EM: "Get cart successfully", EC: 0,
                        DT: result.page.items.map((item) => ({
                            id: item.id, productId: item.productId, name: item.productName,
                            price: item.unitPrice, images: item.images, size: item.sizeName,
                            quantity: item.quantity, productVariantId: item.productVariantId,
                            catalogActive: item.catalogActive,
                        })),
                        pagination: { page: result.page.page, limit: result.page.limit,
                            totalItems: result.page.totalItems, totalPages: result.page.totalPages },
                    });
                    return;
                case "customer_profile_required":
                    response.status(403).json({ EM: "Customer identity required", EC: 3, DT: [] }); return;
                case "invalid_cart_query":
                    response.status(400).json({ EM: "Invalid cart query", EC: 1, DT: [] }); return;
                case "cart_unavailable":
                    response.status(503).json({ EM: "Cart service unavailable", EC: -1, DT: [] }); return;
            }
        },
        add: async (request, response) => {
            const context = contextOf(request);
            if (!context) return void response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            if (!context.customerId) return void response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
            let variantId;
            try {
                variantId = await dependencies.variants.findActiveId(
                    serializeEntityId(request.body.id), serializeEntityId(request.body.sizeId),
                );
            } catch {
                response.status(503).json({ EM: "Cart service unavailable", EC: -1, DT: null }); return;
            }
            if (!variantId) return void response.status(404).json({ EM: "Product size unavailable", EC: 1, DT: null });
            const result = await dependencies.mutation.add(context, {
                productVariantId: variantId, quantity: request.body.quantity,
            });
            switch (result.kind) {
                case "added":
                    response.status(200).json({ EM: "Add to cart successfully", EC: 0, DT: { quantity: result.quantity } }); return;
                case "variant_unavailable":
                    response.status(404).json({ EM: "Product size unavailable", EC: 1, DT: null }); return;
                case "quantity_limit_exceeded":
                    response.status(409).json({ EM: "Quantity limit exceeded", EC: 1, DT: null }); return;
                case "customer_profile_required":
                    response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null }); return;
                case "invalid_cart_item":
                    response.status(400).json({ EM: "Invalid cart item", EC: 1, DT: null }); return;
                case "cart_unavailable":
                    response.status(503).json({ EM: "Cart service unavailable", EC: -1, DT: null }); return;
            }
        },
        update: async (request, response) => {
            const context = contextOf(request);
            if (!context) return void response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            const result = await dependencies.mutation.update(context, {
                cartItemId: request.body.cartProductSizeId, quantity: request.body.quantity,
            });
            switch (result.kind) {
                case "updated":
                    response.status(200).json({ EM: "Update cart successfully", EC: 0, DT: { quantity: result.quantity } }); return;
                case "item_not_found":
                    response.status(404).json({ EM: "Cart item not found", EC: 1, DT: null }); return;
                case "variant_unavailable":
                    response.status(409).json({ EM: "Product size unavailable", EC: 1, DT: null }); return;
                case "customer_profile_required":
                    response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null }); return;
                case "invalid_cart_item":
                    response.status(400).json({ EM: "Invalid cart item", EC: 1, DT: null }); return;
                case "cart_unavailable":
                    response.status(503).json({ EM: "Cart service unavailable", EC: -1, DT: null }); return;
            }
        },
        remove: async (request, response) => {
            const context = contextOf(request);
            if (!context) return void response.status(401).json({ EM: "Authentication required", EC: 3, DT: null });
            const result = await dependencies.mutation.remove(context, {
                cartItemId: request.params.cartProductSizeId,
            });
            switch (result.kind) {
                case "removed":
                    response.status(200).json({ EM: "Remove cart item successfully", EC: 0, DT: null }); return;
                case "item_not_found":
                    response.status(404).json({ EM: "Cart item not found", EC: 1, DT: null }); return;
                case "customer_profile_required":
                    response.status(403).json({ EM: "Customer identity required", EC: 3, DT: null }); return;
                case "invalid_cart_item":
                    response.status(400).json({ EM: "Invalid cart item", EC: 1, DT: null }); return;
                case "cart_unavailable":
                    response.status(503).json({ EM: "Cart service unavailable", EC: -1, DT: null }); return;
            }
        },
    };
};
