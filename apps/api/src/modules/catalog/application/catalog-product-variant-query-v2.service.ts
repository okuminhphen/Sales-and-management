import {
    serializeEntityId,
    type EntityId,
} from "../../../shared/contracts/database-scalars.js";

export type CatalogProductVariant = {
    id: EntityId;
    productId: EntityId;
    sizeId: EntityId;
    sizeName: string;
};

/** Product selection port deliberately omits SKU and inventory quantities from public catalog reads. */
export interface CatalogProductVariantV2Repository {
    listActiveForProduct: (productId: EntityId) => Promise<readonly CatalogProductVariant[] | null>;
}

export type CatalogProductVariantQueryResult =
    | { kind: "product_variants"; variants: readonly CatalogProductVariant[] }
    | { kind: "product_not_found" }
    | { kind: "invalid_product_query" }
    | { kind: "catalog_unavailable" };

const parseProductId = (value: unknown): EntityId | null => {
    try {
        return serializeEntityId(value);
    } catch {
        return null;
    }
};

/** Public selectable variants for an active product; availability belongs to the inventory service. */
export class CatalogProductVariantQueryV2Service {
    constructor(private readonly dependencies: { repository: CatalogProductVariantV2Repository }) {}

    async listByProductId(productIdInput: unknown): Promise<CatalogProductVariantQueryResult> {
        const productId = parseProductId(productIdInput);
        if (!productId) return { kind: "invalid_product_query" };
        try {
            const variants = await this.dependencies.repository.listActiveForProduct(productId);
            return variants === null
                ? { kind: "product_not_found" }
                : { kind: "product_variants", variants };
        } catch {
            return { kind: "catalog_unavailable" };
        }
    }
}
