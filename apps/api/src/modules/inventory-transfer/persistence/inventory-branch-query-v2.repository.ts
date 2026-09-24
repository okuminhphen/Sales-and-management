import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, serializeMoney, type EntityId } from "../../../shared/contracts/database-scalars.js";
import { toCatalogPublicImages } from "../../catalog/application/catalog-public-media.js";
import type { BranchInventoryProduct, InventoryBranchV2Repository } from "../application/inventory-branch-query-v2.service.js";

type InventoryRow = {
    productId: unknown; name: unknown; description: unknown; price: unknown; images: unknown;
    variantId: unknown; sizeId: unknown; sizeName: unknown; stock: unknown; reserved: unknown;
};
const count = (value: unknown): number => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid inventory count in database.");
    return parsed;
};

/** Legacy grouped shape, V2 scalar contracts, and explicit active-hold availability. */
export class SequelizeInventoryBranchV2Repository implements InventoryBranchV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async listByBranch(branchId: EntityId): Promise<readonly BranchInventoryProduct[] | null> {
        const branches = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM branches WHERE id = ?", { replacements: [branchId], type: QueryTypes.SELECT },
        );
        if (branches.length === 0) return null;
        const rows = await this.persistence.sequelize.query<InventoryRow>(
            `SELECT p.id AS productId, p.name, p.description, p.base_price AS price, p.images,
                    v.id AS variantId, s.id AS sizeId, s.name AS sizeName,
                    i.stock, COALESCE(h.reserved, 0) AS reserved
             FROM inventories i
             JOIN product_variants v ON v.id = i.product_variant_id
             JOIN products p ON p.id = v.product_id
             JOIN sizes s ON s.id = v.size_id
             LEFT JOIN (
                SELECT inventory_id, SUM(quantity) AS reserved
                FROM inventory_reservations WHERE status = 'active' GROUP BY inventory_id
             ) h ON h.inventory_id = i.id
             WHERE i.branch_id = ?
             ORDER BY p.id ASC, s.name ASC, v.id ASC`,
            { replacements: [branchId], type: QueryTypes.SELECT },
        );
        const products = new Map<string, BranchInventoryProduct & { sizes: BranchInventoryProduct["sizes"][number][] }>();
        for (const row of rows) {
            if (typeof row.name !== "string" || typeof row.sizeName !== "string") throw new Error("Invalid inventory catalog data.");
            const description = typeof row.description === "string" ? row.description : null;
            if (row.description !== null && description === null) throw new Error("Invalid product description.");
            const productId = serializeDatabaseEntityId(row.productId);
            const stock = count(row.stock);
            const reserved = count(row.reserved);
            if (reserved > stock) throw new Error("Active holds exceed physical stock.");
            let product = products.get(productId);
            if (!product) {
                const images = typeof row.images === "string" ? JSON.parse(row.images) as unknown : row.images;
                product = { id: productId, name: row.name, description,
                    price: serializeMoney(row.price), images: toCatalogPublicImages(images), sizes: [] };
                products.set(productId, product);
            }
            product.sizes.push({ productSizeId: serializeDatabaseEntityId(row.variantId),
                sizeId: serializeDatabaseEntityId(row.sizeId), sizeName: row.sizeName,
                stock, reserved, available: stock - reserved });
        }
        return [...products.values()];
    }
}
