import { serializeEntityId, type EntityId, type Money } from "../../../shared/contracts/database-scalars.js";
import { canAccessBranch, hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import type { CatalogPublicImage } from "../../catalog/application/catalog-public-media.js";

export type BranchInventoryProduct = {
    id: EntityId; name: string; description: string | null; price: Money;
    images: readonly CatalogPublicImage[];
    sizes: readonly {
        productSizeId: EntityId; sizeId: EntityId; sizeName: string;
        stock: number; reserved: number; available: number;
    }[];
};
export interface InventoryBranchV2Repository {
    listByBranch: (branchId: EntityId) => Promise<readonly BranchInventoryProduct[] | null>;
}
export type InventoryBranchQueryResult =
    | { kind: "inventory"; products: readonly BranchInventoryProduct[] }
    | { kind: "forbidden" | "invalid_inventory_query" | "branch_not_found" | "inventory_unavailable" };

/** Backoffice branch inventory only; a public availability API needs a separate policy. */
export class InventoryBranchQueryV2Service {
    constructor(private readonly dependencies: { repository: InventoryBranchV2Repository }) {}

    async list(context: V2AccessContext, branchIdInput: unknown): Promise<InventoryBranchQueryResult> {
        let branchId: EntityId;
        try { branchId = serializeEntityId(branchIdInput); }
        catch { return { kind: "invalid_inventory_query" }; }
        if (!canAccessBranch(context, branchId, "inventory.read.branch")
            && !hasGlobalPermission(context, "inventory.read.branch")) return { kind: "forbidden" };
        try {
            const products = await this.dependencies.repository.listByBranch(branchId);
            return products === null ? { kind: "branch_not_found" } : { kind: "inventory", products };
        } catch { return { kind: "inventory_unavailable" }; }
    }
}
