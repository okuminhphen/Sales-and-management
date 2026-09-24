import { UniqueConstraintError } from "sequelize";
import type { Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogVariantCommandV2Repository, VariantCommandOutcome, VariantCreateV2, VariantPatchV2,
} from "../application/catalog-variant-command-v2.service.js";
import type { ProductAttributes, ProductVariantAttributes, SizeAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";
import { appendCatalogProductEvent } from "./catalog-product-command-v2.repository.js";

/** Product row lock serializes variant changes with product metadata and outbox projection. */
export class SequelizeCatalogVariantCommandV2Repository implements CatalogVariantCommandV2Repository {
    private readonly product: CatalogModel<ProductAttributes>;
    private readonly size: CatalogModel<SizeAttributes>;
    private readonly variant: CatalogModel<ProductVariantAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.product = getCatalogModel<ProductAttributes>(persistence, "Product");
        this.size = getCatalogModel<SizeAttributes>(persistence, "Size");
        this.variant = getCatalogModel<ProductVariantAttributes>(persistence, "ProductVariant");
    }

    private async lockProduct(productId: EntityId, transaction: Transaction) {
        return this.product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
    }

    async create(productId: EntityId, input: VariantCreateV2): Promise<VariantCommandOutcome> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const product = await this.lockProduct(productId, transaction);
                if (!product) return { kind: "product_not_found" };
                if (!await this.size.findByPk(input.sizeId, { transaction })) return { kind: "size_not_found" };
                const now = new Date();
                const variant = await this.variant.create({
                    productId, sizeId: input.sizeId, sku: input.sku, status: input.status,
                    createdAt: now, updatedAt: now,
                }, { transaction });
                await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
                return { kind: "created", id: serializeDatabaseEntityId(variant.dataValues.id) };
            });
        } catch (error) {
            if (error instanceof UniqueConstraintError) return { kind: "variant_conflict" };
            throw error;
        }
    }

    async update(productId: EntityId, variantId: EntityId, patch: VariantPatchV2): Promise<VariantCommandOutcome> {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const product = await this.lockProduct(productId, transaction);
                if (!product) return { kind: "product_not_found" };
                const variant = await this.variant.findOne({ where: { id: variantId, productId },
                    transaction, lock: transaction.LOCK.UPDATE });
                if (!variant) return { kind: "variant_not_found" };
                await variant.update({ ...patch, updatedAt: new Date() }, { transaction });
                await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
                return { kind: "updated", id: variantId };
            });
        } catch (error) {
            if (error instanceof UniqueConstraintError) return { kind: "variant_conflict" };
            throw error;
        }
    }

    async deactivate(productId: EntityId, variantId: EntityId): Promise<VariantCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const product = await this.lockProduct(productId, transaction);
            if (!product) return { kind: "product_not_found" };
            const variant = await this.variant.findOne({ where: { id: variantId, productId },
                transaction, lock: transaction.LOCK.UPDATE });
            if (!variant) return { kind: "variant_not_found" };
            if (variant.dataValues.status !== "inactive") {
                await variant.update({ status: "inactive", updatedAt: new Date() }, { transaction });
                await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
            }
            return { kind: "deactivated" };
        });
    }
}
