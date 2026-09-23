import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { CartVariantV2Resolver } from "../application/cart-variant-v2.resolver.js";

type VariantRow = { id: unknown };

export class SequelizeCartVariantV2Resolver implements CartVariantV2Resolver {
    constructor(private readonly persistence: V2Persistence) {}

    async findActiveId(productId: EntityId, sizeId: EntityId): Promise<EntityId | null> {
        const rows = await this.persistence.sequelize.query<VariantRow>(
            `SELECT product_variants.id AS id
             FROM product_variants
             INNER JOIN products ON products.id = product_variants.product_id
             WHERE product_variants.product_id = ? AND product_variants.size_id = ?
               AND product_variants.status = 'active' AND products.status = 'active'
             LIMIT 1`,
            { replacements: [productId, sizeId], type: QueryTypes.SELECT },
        );
        return rows[0] ? serializeDatabaseEntityId(rows[0].id) : null;
    }
}
