import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import type { EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    AddCartItemOutcome,
    CartMutationV2Repository,
    RemoveCartItemOutcome,
    UpdateCartItemOutcome,
} from "../application/cart-mutation-v2.service.js";

const MAX_CART_ITEM_QUANTITY = 2_147_483_647;

type IdRow = { id: string | number };
type QuantityRow = { quantity: number };
type MutableItemRow = { variantStatus: string; productStatus: string };

/** Serializes writes per customer cart; unique constraints remain the final DB safeguard. */
export class SequelizeCartMutationV2Repository implements CartMutationV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async add(customerId: EntityId, productVariantId: EntityId, quantity: number): Promise<AddCartItemOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const variants = await this.persistence.sequelize.query<IdRow>(
                `SELECT product_variants.id AS id
                 FROM product_variants
                 INNER JOIN products ON products.id = product_variants.product_id
                 WHERE product_variants.id = ?
                   AND product_variants.status = 'active' AND products.status = 'active'`,
                { replacements: [productVariantId], type: QueryTypes.SELECT, transaction },
            );
            if (!variants[0]) return { kind: "variant_unavailable" };

            await this.persistence.sequelize.query(
                `INSERT INTO carts (customer_id, created_at, updated_at)
                 VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                 ON DUPLICATE KEY UPDATE id = id`,
                { replacements: [customerId], transaction },
            );
            const cartId = await this.lockCart(customerId, transaction);
            const items = await this.persistence.sequelize.query<QuantityRow>(
                `SELECT quantity FROM cart_items
                 WHERE cart_id = ? AND product_variant_id = ? FOR UPDATE`,
                { replacements: [cartId, productVariantId], type: QueryTypes.SELECT, transaction },
            );
            const previous = items[0]?.quantity ?? 0;
            if (!Number.isSafeInteger(previous) || previous < 0) {
                throw new TypeError("Database cart item quantity is invalid.");
            }
            const next = previous + quantity;
            if (next > MAX_CART_ITEM_QUANTITY) return { kind: "quantity_limit_exceeded" };

            if (items[0]) {
                await this.persistence.sequelize.query(
                    `UPDATE cart_items SET quantity = ?, updated_at = UTC_TIMESTAMP(3)
                     WHERE cart_id = ? AND product_variant_id = ?`,
                    { replacements: [next, cartId, productVariantId], transaction },
                );
            } else {
                await this.persistence.sequelize.query(
                    `INSERT INTO cart_items (cart_id, product_variant_id, quantity, created_at, updated_at)
                     VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
                    { replacements: [cartId, productVariantId, next], transaction },
                );
            }
            return { kind: "added", quantity: next };
        });
    }

    async remove(customerId: EntityId, cartItemId: EntityId): Promise<RemoveCartItemOutcome> {
        const affectedRows = await this.persistence.sequelize.query(
            `DELETE cart_items FROM cart_items
             INNER JOIN carts ON carts.id = cart_items.cart_id
             WHERE carts.customer_id = ? AND cart_items.id = ?`,
            { replacements: [customerId, cartItemId], type: QueryTypes.BULKDELETE },
        );
        if (affectedRows === 0) return { kind: "item_not_found" };
        if (affectedRows !== 1) throw new TypeError("Cart item deletion affected an unexpected number of rows.");
        return { kind: "removed" };
    }

    async update(customerId: EntityId, cartItemId: EntityId, quantity: number): Promise<UpdateCartItemOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const carts = await this.persistence.sequelize.query<IdRow>(
                "SELECT id FROM carts WHERE customer_id = ? FOR UPDATE",
                { replacements: [customerId], type: QueryTypes.SELECT, transaction },
            );
            const cartId = carts[0]?.id;
            if (!cartId) return { kind: "item_not_found" };

            const items = await this.persistence.sequelize.query<MutableItemRow>(
                `SELECT product_variants.status AS variantStatus, products.status AS productStatus
                 FROM cart_items
                 INNER JOIN product_variants ON product_variants.id = cart_items.product_variant_id
                 INNER JOIN products ON products.id = product_variants.product_id
                 WHERE cart_items.id = ? AND cart_items.cart_id = ? FOR UPDATE`,
                { replacements: [cartItemId, cartId], type: QueryTypes.SELECT, transaction },
            );
            if (!items[0]) return { kind: "item_not_found" };
            if (items[0].variantStatus !== "active" || items[0].productStatus !== "active") {
                return { kind: "variant_unavailable" };
            }

            await this.persistence.sequelize.query(
                "UPDATE cart_items SET quantity = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND cart_id = ?",
                { replacements: [quantity, cartItemId, cartId], transaction },
            );
            return { kind: "updated", quantity };
        });
    }

    private async lockCart(customerId: EntityId, transaction: Transaction): Promise<string | number> {
        const rows = await this.persistence.sequelize.query<IdRow>(
            "SELECT id FROM carts WHERE customer_id = ? FOR UPDATE",
            { replacements: [customerId], type: QueryTypes.SELECT, transaction },
        );
        if (!rows[0]) throw new Error("Cart was not created.");
        return rows[0].id;
    }
}
