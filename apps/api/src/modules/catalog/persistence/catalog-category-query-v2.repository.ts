import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogCategory,
    CatalogCategoryListQuery,
    CatalogCategoryPage,
    CatalogCategoryV2Repository,
} from "../application/catalog-category-query-v2.service.js";
import type { CategoryAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

const toCatalogCategory = (category: CategoryAttributes): CatalogCategory => ({
    id: serializeDatabaseEntityId(category.id),
    parentId: category.parentId === null ? null : serializeDatabaseEntityId(category.parentId),
    code: category.code,
    name: category.name,
    slug: category.slug,
    description: category.description,
});

/** MySQL read adapter for the public category directory, ordered stably by code. */
export class SequelizeCatalogCategoryV2Repository implements CatalogCategoryV2Repository {
    private readonly category: CatalogModel<CategoryAttributes>;

    constructor(persistence: V2Persistence) {
        this.category = getCatalogModel<CategoryAttributes>(persistence, "Category");
    }

    async listCategories(query: CatalogCategoryListQuery): Promise<CatalogCategoryPage> {
        const { count, rows } = await this.category.findAndCountAll({
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["code", "ASC"]],
        });
        return {
            categories: rows.map((category) => toCatalogCategory(category.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }
}
