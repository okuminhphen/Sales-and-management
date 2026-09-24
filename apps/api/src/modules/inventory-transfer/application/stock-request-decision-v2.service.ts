import { hasGlobalPermission, type V2AccessContext } from "../../identity-access/application/access-context.js";
import { serializeEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

type Outcome<K extends string> = K extends string ? { kind: K } : never;

export type StockRequestDecisionOutcome =
    | { kind: "approved"; stockRequestId: EntityId; transferReceiptId: EntityId }
    | Outcome<"rejected" | "request_not_found" | "request_already_processed"
        | "forbidden" | "invalid_stock_request" | "stock_request_unavailable">;

export interface StockRequestDecisionV2Repository {
    approve: (id: EntityId, actorAccountId: EntityId) => Promise<Exclude<StockRequestDecisionOutcome,
        { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>>;
    reject: (id: EntityId, actorAccountId: EntityId, note: string) => Promise<Exclude<StockRequestDecisionOutcome,
        { kind: "forbidden" | "invalid_stock_request" | "stock_request_unavailable" }>>;
}

const parseId = (input: unknown): EntityId | null => {
    try { return serializeEntityId(input); } catch { return null; }
};

/** Stock request approval creates only a pending transfer; T31 owns inventory reservations and movement. */
export class StockRequestDecisionV2Service {
    constructor(private readonly dependencies: { repository: StockRequestDecisionV2Repository }) {}

    async approve(context: V2AccessContext, idInput: unknown): Promise<StockRequestDecisionOutcome> {
        const id = parseId(idInput);
        const actor = parseId(context.accountId);
        if (!id || !actor) return { kind: "invalid_stock_request" };
        if (!hasGlobalPermission(context, "stock_request.manage.branch")) return { kind: "forbidden" };
        try { return await this.dependencies.repository.approve(id, actor); }
        catch { return { kind: "stock_request_unavailable" }; }
    }

    async reject(context: V2AccessContext, idInput: unknown, noteInput: unknown): Promise<StockRequestDecisionOutcome> {
        const id = parseId(idInput);
        const actor = parseId(context.accountId);
        const note = typeof noteInput === "string" ? noteInput.trim() : "";
        if (!id || !actor || note.length === 0 || note.length > 500) return { kind: "invalid_stock_request" };
        if (!hasGlobalPermission(context, "stock_request.manage.branch")) return { kind: "forbidden" };
        try { return await this.dependencies.repository.reject(id, actor, note); }
        catch { return { kind: "stock_request_unavailable" }; }
    }
}
