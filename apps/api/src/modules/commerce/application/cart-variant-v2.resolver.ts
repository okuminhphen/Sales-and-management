import type { EntityId } from "../../../shared/contracts/database-scalars.js";

/** Translates the old product/size pair at the compatibility boundary. */
export interface CartVariantV2Resolver {
    findActiveId: (productId: EntityId, sizeId: EntityId) => Promise<EntityId | null>;
}
