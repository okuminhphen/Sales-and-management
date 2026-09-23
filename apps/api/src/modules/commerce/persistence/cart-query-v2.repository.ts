import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import {
    serializeDatabaseEntityId,
    serializeMoney,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";
import type {
    CartItemView,
    CartListQuery,
    CartPage,
    CartQueryV2Repository,
} from "../application/cart-query-v2.service.js";

type CartItemRow = {
    id: unknown;
    productId: unknown;
    productVariantId: unknown;
    sizeId: unknown;
    productName: unknown;
    sizeName: unknown;
    unitPrice: unknown;
    quantity: unknown;
    productStatus: unknown;
    variantStatus: unknown;
};

const toCartItem = (row: CartItemRow): CartItemView => {
    if (
        typeof row.productName !== "string"
        || typeof row.sizeName !== "string"
        || typeof row.quantity !== "number"
        || !Number.isSafeInteger(row.quantity)
        || row.quantity <= 0
    ) throw new TypeError("Database cart item has invalid fields.");
    return {
        id: serializeDatabaseEntityId(row.id),
        productId: serializeDatabaseEntityId(row.productId),
        productVariantId: serializeDatabaseEntityId(row.productVariantId),
        sizeId: serializeDatabaseEntityId(row.sizeId),
        productName: row.productName,
        sizeName: row.sizeName,
        unitPrice: serializeMoney(row.unitPrice),
        quantity: row.quantity,
        catalogActive: row.productStatus === "active" && row.variantStatus === "active",
    };
};

/** MySQL read adapter scoped by customer ownership; reading does not create a cart. */
export class SequelizeCartQueryV2Repository implements CartQueryV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listByCustomerId(customerId: EntityId, query: CartListQuery): Promise<CartPage> {
        const counts = await this.persistence.sequelize.query<{ totalItems: number | string }>(
            `SELECT COUNT(*) AS totalItems
             FROM cart_items
             INNER JOIN carts ON carts.id = cart_items.cart_id
             WHERE carts.customer_id = ?`,
            { replacements: [customerId], type: QueryTypes.SELECT },
        );
        const totalItems = Number(counts[0]?.totalItems ?? 0);
        if (!Number.isSafeInteger(totalItems) || totalItems < 0) {
            throw new TypeError("Database cart item count is invalid.");
        }
        const rows = await this.persistence.sequelize.query<CartItemRow>(
            `SELECT cart_items.id AS id,
                    products.id AS productId,
                    product_variants.id AS productVariantId,
                    sizes.id AS sizeId,
                    products.name AS productName,
                    sizes.name AS sizeName,
                    products.base_price AS unitPrice,
                    cart_items.quantity AS quantity,
                    products.status AS productStatus,
                    product_variants.status AS variantStatus
             FROM cart_items
             INNER JOIN carts ON carts.id = cart_items.cart_id
             INNER JOIN product_variants ON product_variants.id = cart_items.product_variant_id
             INNER JOIN products ON products.id = product_variants.product_id
             INNER JOIN sizes ON sizes.id = product_variants.size_id
             WHERE carts.customer_id = ?
             ORDER BY cart_items.id ASC
             LIMIT ? OFFSET ?`,
            {
                replacements: [customerId, query.limit, (query.page - 1) * query.limit],
                type: QueryTypes.SELECT,
            },
        );
        return {
            items: rows.map(toCartItem),
            page: query.page,
            limit: query.limit,
            totalItems,
            totalPages: Math.ceil(totalItems / query.limit),
        };
    }
}
