import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type AddCartItemInput = { productVariantId: unknown; quantity: unknown };
export type AddCartItemOutcome =
    | { kind: "added"; quantity: number }
    | { kind: "variant_unavailable" }
    | { kind: "quantity_limit_exceeded" };
export type AddCartItemResult = AddCartItemOutcome
    | { kind: "customer_profile_required" }
    | { kind: "invalid_cart_item" }
    | { kind: "cart_unavailable" };
export type RemoveCartItemInput = { cartItemId: unknown };
export type RemoveCartItemOutcome = { kind: "removed" } | { kind: "item_not_found" };
export type RemoveCartItemResult = RemoveCartItemOutcome
    | { kind: "customer_profile_required" }
    | { kind: "invalid_cart_item" }
    | { kind: "cart_unavailable" };
export type UpdateCartItemInput = { cartItemId: unknown; quantity: unknown };
export type UpdateCartItemOutcome =
    | { kind: "updated"; quantity: number }
    | { kind: "item_not_found" }
    | { kind: "variant_unavailable" };
export type UpdateCartItemResult = UpdateCartItemOutcome
    | { kind: "customer_profile_required" }
    | { kind: "invalid_cart_item" }
    | { kind: "cart_unavailable" };

export interface CartMutationV2Repository {
    add: (customerId: EntityId, productVariantId: EntityId, quantity: number) => Promise<AddCartItemOutcome>;
    remove: (customerId: EntityId, cartItemId: EntityId) => Promise<RemoveCartItemOutcome>;
    update: (customerId: EntityId, cartItemId: EntityId, quantity: number) => Promise<UpdateCartItemOutcome>;
}

const isValidQuantity = (quantity: unknown): quantity is number =>
    typeof quantity === "number" && Number.isInteger(quantity)
    && quantity > 0 && quantity <= 2_147_483_647;

/** Adds an active variant to a DB-derived customer's reusable cart. Stock is checked at checkout. */
export class CartMutationV2Service {
    constructor(private readonly dependencies: { repository: CartMutationV2Repository }) {}

    async add(context: V2AccessContext, input: AddCartItemInput): Promise<AddCartItemResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        if (!isValidQuantity(input.quantity)) {
            return { kind: "invalid_cart_item" };
        }
        let productVariantId: EntityId;
        try {
            productVariantId = serializeEntityId(input.productVariantId);
        } catch {
            return { kind: "invalid_cart_item" };
        }
        try {
            return await this.dependencies.repository.add(
                serializeEntityId(context.customerId), productVariantId, input.quantity,
            );
        } catch {
            return { kind: "cart_unavailable" };
        }
    }

    async remove(context: V2AccessContext, input: RemoveCartItemInput): Promise<RemoveCartItemResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        let cartItemId: EntityId;
        try {
            cartItemId = serializeEntityId(input.cartItemId);
        } catch {
            return { kind: "invalid_cart_item" };
        }
        try {
            return await this.dependencies.repository.remove(
                serializeEntityId(context.customerId), cartItemId,
            );
        } catch {
            return { kind: "cart_unavailable" };
        }
    }

    async update(context: V2AccessContext, input: UpdateCartItemInput): Promise<UpdateCartItemResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        if (!isValidQuantity(input.quantity)) return { kind: "invalid_cart_item" };
        let cartItemId: EntityId;
        try {
            cartItemId = serializeEntityId(input.cartItemId);
        } catch {
            return { kind: "invalid_cart_item" };
        }
        try {
            return await this.dependencies.repository.update(
                serializeEntityId(context.customerId), cartItemId, input.quantity,
            );
        } catch {
            return { kind: "cart_unavailable" };
        }
    }
}
