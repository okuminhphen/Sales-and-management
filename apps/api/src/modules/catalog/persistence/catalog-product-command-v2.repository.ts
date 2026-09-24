import { randomUUID } from "node:crypto";
import type { Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogProductCommandV2Repository, ProductCommandOutcome, ProductMetadataPatchV2, ProductMetadataV2,
} from "../application/catalog-product-command-v2.service.js";
import type { CategoryAttributes, ProductAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

const slugFor = (name: string): string => {
    const prefix = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "").slice(0, 180) || "product";
    return `${prefix}-${randomUUID().replace(/-/g, "")}`;
};

export const appendCatalogProductEvent = async (
    persistence: V2Persistence, transaction: Transaction, product: ProductAttributes,
    eventType: "catalog.product.upserted" | "catalog.product.deleted",
): Promise<void> => {
    const id = serializeDatabaseEntityId(product.id);
    const payload = {
        product_id: id, name: product.name, description: product.description ?? "",
        price: product.basePrice, images: product.images ?? [], category_id: product.categoryId,
        status: product.status,
    };
    await persistence.sequelize.query(
        `INSERT INTO outbox_events
         (event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at,
          published_at, attempts, locked_at, last_error, created_at, updated_at)
         VALUES (?, ?, 'product', ?, ?, UTC_TIMESTAMP(3), NULL, 0, NULL, NULL,
                 UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        { replacements: [randomUUID(), eventType, id, JSON.stringify(payload)], transaction },
    );
};

/** Product metadata and catalog event commit in the same MySQL transaction. */
export class SequelizeCatalogProductCommandV2Repository implements CatalogProductCommandV2Repository {
    private readonly product: CatalogModel<ProductAttributes>;
    private readonly category: CatalogModel<CategoryAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.product = getCatalogModel<ProductAttributes>(persistence, "Product");
        this.category = getCatalogModel<CategoryAttributes>(persistence, "Category");
    }

    async create(input: ProductMetadataV2): Promise<ProductCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const category = await this.category.findByPk(input.categoryId, { transaction });
            if (!category) return { kind: "category_not_found" };
            const now = new Date();
            const product = await this.product.create({
                ...input, slug: slugFor(input.name), images: null,
                createdAt: now, updatedAt: now,
            }, { transaction });
            await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
            return { kind: "created", id: serializeDatabaseEntityId(product.dataValues.id) };
        });
    }

    async update(id: EntityId, patch: ProductMetadataPatchV2): Promise<ProductCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const product = await this.product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!product) return { kind: "product_not_found" };
            if (patch.categoryId !== undefined) {
                const category = await this.category.findByPk(patch.categoryId, { transaction });
                if (!category) return { kind: "category_not_found" };
            }
            await product.update({ ...patch, updatedAt: new Date() }, { transaction });
            await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.upserted");
            return { kind: "updated", id };
        });
    }

    async deactivate(id: EntityId): Promise<ProductCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const product = await this.product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!product) return { kind: "product_not_found" };
            if (product.dataValues.status !== "inactive") {
                await product.update({ status: "inactive", updatedAt: new Date() }, { transaction });
                await appendCatalogProductEvent(this.persistence, transaction, product.dataValues, "catalog.product.deleted");
            }
            return { kind: "deactivated" };
        });
    }
}
