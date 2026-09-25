import {
    canAccessBranch, hasGlobalPermission, type V2AccessContext,
} from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type CancelOrderCommand = {
    orderId: EntityId; branchId: EntityId; actorAccountId: EntityId; reason: string;
};
export type CancelOrderResult =
    | { kind: "cancelled" | "replayed"; orderId: EntityId }
    | { kind: "order_not_cancellable" | "payment_unresolved" | "cancellation_unavailable" };
export interface OrderCancellationV2Repository {
    findBranch: (orderId: EntityId) => Promise<EntityId | null>;
    cancel: (command: CancelOrderCommand) => Promise<CancelOrderResult>;
}
export type OrderCancellationCommandResult = CancelOrderResult
    | { kind: "forbidden" | "invalid_order" | "invalid_reason" | "order_not_found" };

/** Initial cancellation boundary: internal staff only, pending unpaid pickup only. */
export class OrderCancellationV2Service {
    constructor(private readonly dependencies: { repository: OrderCancellationV2Repository }) {}

    async cancel(context: V2AccessContext, orderIdInput: unknown, reasonInput: unknown): Promise<OrderCancellationCommandResult> {
        let orderId: EntityId;
        let actorAccountId: EntityId;
        try {
            orderId = serializeEntityId(orderIdInput);
            actorAccountId = serializeEntityId(context.accountId);
        } catch { return { kind: "invalid_order" }; }
        if (typeof reasonInput !== "string") return { kind: "invalid_reason" };
        const reason = reasonInput.trim();
        if (!reason || reason.length > 500) return { kind: "invalid_reason" };
        const global = hasGlobalPermission(context, "order.manage.global");
        if (!global && !context.grants.some((grant) => grant.roleCode !== "CUSTOMER"
            && grant.scope.type === "branch" && grant.permissions.includes("order.manage.branch"))) {
            return { kind: "forbidden" };
        }
        let branchId: EntityId | null;
        try { branchId = await this.dependencies.repository.findBranch(orderId); }
        catch { return { kind: "cancellation_unavailable" }; }
        if (!branchId) return { kind: "order_not_found" };
        if (!global && !canAccessBranch(context, branchId, "order.manage.branch")) return { kind: "forbidden" };
        try { return await this.dependencies.repository.cancel({ orderId, branchId, actorAccountId, reason }); }
        catch { return { kind: "cancellation_unavailable" }; }
    }
}
