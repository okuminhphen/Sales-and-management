import {
    canAccessBranch, hasGlobalPermission, type V2AccessContext,
} from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ConfirmOrderCommand = { orderId: EntityId; branchId: EntityId; actorAccountId: EntityId };
export type ConfirmOrderResult =
    | { kind: "confirmed" | "replayed"; orderId: EntityId }
    | { kind: "order_not_pending" | "payment_not_settled" | "reservation_expired" | "confirmation_unavailable" };
export interface OrderConfirmationV2Repository {
    findBranch: (orderId: EntityId) => Promise<EntityId | null>;
    confirm: (command: ConfirmOrderCommand) => Promise<ConfirmOrderResult>;
}
export type OrderConfirmationCommandResult = ConfirmOrderResult
    | { kind: "forbidden" | "invalid_order" | "order_not_found" };

/** Confirmation is an internal branch/global operation, never an online-customer action. */
export class OrderConfirmationV2Service {
    constructor(private readonly dependencies: { repository: OrderConfirmationV2Repository }) {}

    async confirm(context: V2AccessContext, orderIdInput: unknown): Promise<OrderConfirmationCommandResult> {
        let orderId: EntityId;
        let actorAccountId: EntityId;
        try {
            orderId = serializeEntityId(orderIdInput);
            actorAccountId = serializeEntityId(context.accountId);
        } catch { return { kind: "invalid_order" }; }
        const global = hasGlobalPermission(context, "order.manage.global");
        if (!global && !context.grants.some((grant) => grant.roleCode !== "CUSTOMER"
            && grant.scope.type === "branch" && grant.permissions.includes("order.manage.branch"))) {
            return { kind: "forbidden" };
        }
        let branchId: EntityId | null;
        try { branchId = await this.dependencies.repository.findBranch(orderId); }
        catch { return { kind: "confirmation_unavailable" }; }
        if (!branchId) return { kind: "order_not_found" };
        if (!global && !canAccessBranch(context, branchId, "order.manage.branch")) return { kind: "forbidden" };
        try { return await this.dependencies.repository.confirm({ orderId, branchId, actorAccountId }); }
        catch { return { kind: "confirmation_unavailable" }; }
    }
}
