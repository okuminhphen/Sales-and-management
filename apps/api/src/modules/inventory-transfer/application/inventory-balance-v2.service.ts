import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type InventoryBalance = {
    branchId: EntityId;
    productVariantId: EntityId;
    stock: number;
    reserved: number;
    available: number;
};

export interface InventoryBalanceV2Repository {
    findByBranchAndVariant: (branchId: EntityId, variantId: EntityId) => Promise<Omit<InventoryBalance, "available"> | null>;
}

export type InventoryBalanceQueryResult =
    | { kind: "balance"; balance: InventoryBalance }
    | { kind: "inventory_not_found" }
    | { kind: "invalid_inventory_query" }
    | { kind: "inventory_unavailable" };

const parseId = (value: unknown): EntityId | null => {
    try { return serializeEntityId(value); } catch { return null; }
};

/** Read model only. Commands must recompute available under the inventory row lock. */
export class InventoryBalanceV2Service {
    constructor(private readonly dependencies: { repository: InventoryBalanceV2Repository }) {}

    async get(branchIdInput: unknown, variantIdInput: unknown): Promise<InventoryBalanceQueryResult> {
        const branchId = parseId(branchIdInput);
        const variantId = parseId(variantIdInput);
        if (!branchId || !variantId) return { kind: "invalid_inventory_query" };
        try {
            const row = await this.dependencies.repository.findByBranchAndVariant(branchId, variantId);
            if (!row) return { kind: "inventory_not_found" };
            if (!Number.isSafeInteger(row.stock) || !Number.isSafeInteger(row.reserved)
                || row.stock < 0 || row.reserved < 0 || row.reserved > row.stock
                || row.branchId !== branchId || row.productVariantId !== variantId) {
                return { kind: "inventory_unavailable" };
            }
            return { kind: "balance", balance: { ...row, available: row.stock - row.reserved } };
        } catch {
            return { kind: "inventory_unavailable" };
        }
    }
}
