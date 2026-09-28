import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";
import type { V2AccessContext } from "../../identity-access/application/access-context.js";

export interface BehaviorV2Repository {
    recordView: (customerId: EntityId, productId: EntityId) => Promise<boolean>;
    toggleLike: (customerId: EntityId, productId: EntityId) => Promise<boolean | null>;
    getLikeStatus: (customerId: EntityId, productId: EntityId) => Promise<boolean | null>;
}

export type BehaviorResult =
    | { kind: "view_recorded" }
    | { kind: "like_status"; isLiked: boolean }
    | { kind: "customer_required" | "invalid_product_id" | "product_not_found" | "behavior_unavailable" };

export class BehaviorV2Service {
    constructor(private readonly repository: BehaviorV2Repository) {}

    private identity(context: V2AccessContext, rawProductId: unknown): { customerId: EntityId; productId: EntityId } | BehaviorResult {
        if (!context.customerId) return { kind: "customer_required" };
        try {
            return { customerId: serializeEntityId(context.customerId), productId: serializeEntityId(rawProductId) };
        } catch {
            return { kind: "invalid_product_id" };
        }
    }

    async recordView(context: V2AccessContext, rawProductId: unknown): Promise<BehaviorResult> {
        const identity = this.identity(context, rawProductId);
        if ("kind" in identity) return identity;
        try {
            return await this.repository.recordView(identity.customerId, identity.productId)
                ? { kind: "view_recorded" } : { kind: "product_not_found" };
        } catch { return { kind: "behavior_unavailable" }; }
    }

    async toggleLike(context: V2AccessContext, rawProductId: unknown): Promise<BehaviorResult> {
        const identity = this.identity(context, rawProductId);
        if ("kind" in identity) return identity;
        try {
            const isLiked = await this.repository.toggleLike(identity.customerId, identity.productId);
            return isLiked === null ? { kind: "product_not_found" } : { kind: "like_status", isLiked };
        } catch { return { kind: "behavior_unavailable" }; }
    }

    async getLikeStatus(context: V2AccessContext, rawProductId: unknown): Promise<BehaviorResult> {
        const identity = this.identity(context, rawProductId);
        if ("kind" in identity) return identity;
        try {
            const isLiked = await this.repository.getLikeStatus(identity.customerId, identity.productId);
            return isLiked === null ? { kind: "product_not_found" } : { kind: "like_status", isLiked };
        } catch { return { kind: "behavior_unavailable" }; }
    }
}
