import { randomUUID } from "node:crypto";
import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogCategoryCommandV2Repository, CategoryChangeV2, CategoryCommandOutcome, CategoryWriteV2,
} from "../application/catalog-category-command-v2.service.js";
import type { CategoryAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

type CategoryLink = { id: string; parentId: string | null };

const slugFor = (name: string): string => {
    const prefix = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "").slice(0, 180) || "category";
    return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
};

/** Locks the hierarchy in ID order to serialize concurrent reparenting decisions. */
export class SequelizeCatalogCategoryCommandV2Repository implements CatalogCategoryCommandV2Repository {
    private readonly category: CatalogModel<CategoryAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.category = getCatalogModel<CategoryAttributes>(persistence, "Category");
    }

    private async lockedHierarchy(transaction: Parameters<Parameters<V2Persistence["inTransaction"]>[0]>[0]): Promise<readonly CategoryLink[]> {
        return this.persistence.sequelize.query<CategoryLink>(
            "SELECT id, parent_id AS parentId FROM categories ORDER BY id FOR UPDATE",
            { type: QueryTypes.SELECT, transaction },
        );
    }

    async create(input: CategoryWriteV2): Promise<CategoryCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            if (input.parentId !== null) {
                const hierarchy = await this.lockedHierarchy(transaction);
                if (!hierarchy.some((item) => item.id === input.parentId)) return { kind: "parent_not_found" };
            }
            const now = new Date();
            const category = await this.category.create({
                parentId: input.parentId,
                code: `CAT_${randomUUID().replace(/-/g, "").toUpperCase()}`,
                name: input.name,
                slug: slugFor(input.name),
                description: input.description,
                createdAt: now,
                updatedAt: now,
            }, { transaction });
            return { kind: "created", id: serializeDatabaseEntityId(category.dataValues.id) };
        });
    }

    async update(id: EntityId, patch: CategoryChangeV2): Promise<CategoryCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const hierarchy = await this.lockedHierarchy(transaction);
            if (!hierarchy.some((item) => item.id === id)) return { kind: "category_not_found" };
            if (patch.parentId !== undefined && patch.parentId !== null) {
                const parents = new Map(hierarchy.map((item) => [item.id, item.parentId]));
                if (!parents.has(patch.parentId)) return { kind: "parent_not_found" };
                const seen = new Set<string>();
                let cursor: string | null = patch.parentId;
                while (cursor !== null) {
                    if (cursor === id || seen.has(cursor)) return { kind: "category_cycle" };
                    seen.add(cursor);
                    cursor = parents.get(cursor) ?? null;
                }
            }
            await this.category.update({ ...patch, updatedAt: new Date() }, { where: { id }, transaction });
            return { kind: "updated", id };
        });
    }

    async remove(id: EntityId): Promise<CategoryCommandOutcome> {
        return this.persistence.inTransaction(async (transaction) => {
            const hierarchy = await this.lockedHierarchy(transaction);
            if (!hierarchy.some((item) => item.id === id)) return { kind: "category_not_found" };
            if (hierarchy.some((item) => item.parentId === id)) return { kind: "category_in_use" };
            const products = await this.persistence.sequelize.query<{ id: string }>(
                "SELECT id FROM products WHERE category_id = ? LIMIT 1 FOR UPDATE",
                { replacements: [id], type: QueryTypes.SELECT, transaction },
            );
            if (products.length > 0) return { kind: "category_in_use" };
            await this.category.destroy({ where: { id }, transaction });
            return { kind: "deleted" };
        });
    }
}
