import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogProductVariant,
    CatalogProductVariantV2Repository,
} from "../application/catalog-product-variant-query-v2.service.js";

type VariantRow = {
    id: unknown | null;
    productId: unknown;
    sizeId: unknown;
    sizeName: unknown;
};

const toCatalogProductVariant = (variant: VariantRow): CatalogProductVariant => {
    if (typeof variant.sizeName !== "string") {
        throw new TypeError("Database product variant size name is invalid.");
    }
    return {
        id: serializeDatabaseEntityId(variant.id),
        productId: serializeDatabaseEntityId(variant.productId),
        sizeId: serializeDatabaseEntityId(variant.sizeId),
        sizeName: variant.sizeName,
    };
};

/**
 * MySQL adapter for selectable variants. One status-constrained query makes
 * inactive/draft parents indistinguishable from absent products at this boundary.
 */
export class SequelizeCatalogProductVariantV2Repository implements CatalogProductVariantV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listActiveForProduct(productId: string): Promise<readonly CatalogProductVariant[] | null> {
        const rows = await this.persistence.sequelize.query<VariantRow>(
            `SELECT
                product_variants.id AS id,
                products.id AS productId,
                product_variants.size_id AS sizeId,
                sizes.name AS sizeName
            FROM products
            LEFT JOIN product_variants
              ON product_variants.product_id = products.id
             AND product_variants.status = 'active'
            LEFT JOIN sizes ON sizes.id = product_variants.size_id
            WHERE products.id = ?
              AND products.status = 'active'
            ORDER BY sizes.name ASC, product_variants.id ASC`,
            { replacements: [productId], type: QueryTypes.SELECT },
        );
        if (rows.length === 0) return null;
        return rows
            .filter((row): row is VariantRow & { id: NonNullable<VariantRow["id"]> } => row.id !== null)
            .map(toCatalogProductVariant);
    }
}
