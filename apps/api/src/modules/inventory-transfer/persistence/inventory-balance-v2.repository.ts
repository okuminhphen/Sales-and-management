import { QueryTypes } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { InventoryBalanceV2Repository } from "../application/inventory-balance-v2.service.js";

type BalanceRow = { branchId: unknown; productVariantId: unknown; stock: unknown; reserved: unknown };

const parseQuantity = (value: unknown): number => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError("Invalid inventory quantity in database.");
    return parsed;
};

/** Active reservations count even after expires_at; only a guarded worker may release them. */
export class SequelizeInventoryBalanceV2Repository implements InventoryBalanceV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async findByBranchAndVariant(branchId: EntityId, variantId: EntityId) {
        const rows = await this.persistence.sequelize.query<BalanceRow>(
            `SELECT i.branch_id AS branchId, i.product_variant_id AS productVariantId,
                    i.stock AS stock, COALESCE(SUM(r.quantity), 0) AS reserved
             FROM inventories i
             LEFT JOIN inventory_reservations r ON r.inventory_id = i.id AND r.status = 'active'
             WHERE i.branch_id = ? AND i.product_variant_id = ?
             GROUP BY i.id, i.branch_id, i.product_variant_id, i.stock`,
            { replacements: [branchId, variantId], type: QueryTypes.SELECT },
        );
        const row = rows[0];
        return row ? {
            branchId: serializeDatabaseEntityId(row.branchId),
            productVariantId: serializeDatabaseEntityId(row.productVariantId),
            stock: parseQuantity(row.stock), reserved: parseQuantity(row.reserved),
        } : null;
    }
}
