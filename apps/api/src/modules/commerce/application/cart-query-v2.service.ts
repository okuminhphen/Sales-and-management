import type { V2AccessContext } from "../../identity-access/application/access-context.js";
import {
    serializeEntityId,
    type EntityId,
    type Money,
} from "../../../shared/contracts/database-scalars.js";

export type CartItemView = {
    id: EntityId;
    productId: EntityId;
    productVariantId: EntityId;
    sizeId: EntityId;
    productName: string;
    sizeName: string;
    unitPrice: Money;
    quantity: number;
    catalogActive: boolean;
};

export type CartListInput = { page?: unknown; limit?: unknown };
export type CartListQuery = { page: number; limit: number };
export type CartPage = {
    items: readonly CartItemView[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
};

export interface CartQueryV2Repository {
    listByCustomerId: (customerId: EntityId, query: CartListQuery) => Promise<CartPage>;
}

export type CartQueryResult =
    | { kind: "cart"; page: CartPage }
    | { kind: "customer_profile_required" }
    | { kind: "invalid_cart_query" }
    | { kind: "cart_unavailable" };

const normalizeListQuery = (input: CartListInput | undefined): CartListQuery | null => {
    const page = input?.page === undefined ? 1 : input.page;
    const limit = input?.limit === undefined ? 20 : input.limit;
    if (
        typeof page !== "number" || typeof limit !== "number"
        || !Number.isSafeInteger(page) || !Number.isSafeInteger(limit)
        || page <= 0 || limit <= 0 || limit > 100
        || !Number.isSafeInteger((page - 1) * limit)
    ) return null;
    return { page, limit };
};

/** Own-cart read use case. Identity is supplied by the V2 DB-derived access context. */
export class CartQueryV2Service {
    constructor(private readonly dependencies: { repository: CartQueryV2Repository }) {}

    async getOwnCart(context: V2AccessContext, input?: CartListInput): Promise<CartQueryResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        const query = normalizeListQuery(input);
        if (!query) return { kind: "invalid_cart_query" };
        try {
            return {
                kind: "cart",
                page: await this.dependencies.repository.listByCustomerId(
                    serializeEntityId(context.customerId),
                    query,
                ),
            };
        } catch {
            return { kind: "cart_unavailable" };
        }
    }
}
