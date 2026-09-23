import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CatalogSize,
    CatalogSizeListQuery,
    CatalogSizePage,
    CatalogSizeV2Repository,
} from "../application/catalog-size-query-v2.service.js";
import type { SizeAttributes } from "./catalog.models.js";
import { getCatalogModel, type CatalogModel } from "./catalog.model-types.js";

const toCatalogSize = (size: SizeAttributes): CatalogSize => ({
    id: serializeDatabaseEntityId(size.id),
    name: size.name,
});

/** MySQL read adapter for the public size directory, ordered stably by name then ID. */
export class SequelizeCatalogSizeV2Repository implements CatalogSizeV2Repository {
    private readonly size: CatalogModel<SizeAttributes>;

    constructor(persistence: V2Persistence) {
        this.size = getCatalogModel<SizeAttributes>(persistence, "Size");
    }

    async listSizes(query: CatalogSizeListQuery): Promise<CatalogSizePage> {
        const { count, rows } = await this.size.findAndCountAll({
            offset: (query.page - 1) * query.limit,
            limit: query.limit,
            order: [["name", "ASC"], ["id", "ASC"]],
        });
        return {
            sizes: rows.map((size) => toCatalogSize(size.dataValues)),
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
        };
    }
}
