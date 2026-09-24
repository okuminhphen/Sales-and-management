import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type ReturnRestockOutcome =
    | { kind: "restocked" | "replayed"; balanceAfter: number }
    | { kind: "return_item_not_ready" | "source_not_handed_over" | "no_sellable_stock"
        | "already_restocked" | "idempotency_conflict" };

type IdentityRow = { returnId: unknown; orderId: unknown; orderItemId: unknown };
type ReturnRow = { orderId: unknown; receivingBranchId: unknown; status: string };
type ItemRow = { orderId: unknown; variantId: unknown; quantity: unknown };
type ReturnItemRow = { orderItemId: unknown; requested: unknown; approved: unknown; received: unknown;
    restocked: unknown; nonSellable: unknown };
type MovementRow = { returnItemId: unknown; branchId: unknown; variantId: unknown;
    quantityDelta: unknown; balanceAfter: unknown; reason: string; referenceType: string; referenceId: string };

const nonnegativeInt = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

/** Restocks only inspected sellable units; T35 owns return eligibility and authorization. */
export class SequelizeInventoryReturnRestockV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    async restockReturnItem(returnItemId: EntityId, operationKey: string,
        actorAccountId: EntityId): Promise<ReturnRestockOutcome> {
        if (!/^[A-Za-z0-9._:-]{1,191}$/.test(operationKey)) throw new TypeError("Invalid inventory operation key.");
        try {
            const work = (transaction: Transaction) => this.restockLocked(returnItemId, operationKey, actorAccountId, transaction);
            return this.transaction ? await work(this.transaction)
                : await retryV2Transaction(() => this.persistence.inTransaction(work));
        } catch (error) {
            // A caller-owned transaction must abort on a duplicate write, not commit stock without its ledger entry.
            if (!this.transaction && (error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                return { kind: "idempotency_conflict" };
            }
            throw error;
        }
    }

    private async restockLocked(returnItemId: EntityId, operationKey: string,
        actorAccountId: EntityId, transaction: Transaction): Promise<ReturnRestockOutcome> {
        const identities = await this.persistence.sequelize.query<IdentityRow>(
            `SELECT r.id AS returnId, r.order_id AS orderId, ri.order_item_id AS orderItemId
             FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE ri.id = ?`,
            { replacements: [returnItemId], transaction, type: QueryTypes.SELECT },
        );
        const identity = identities[0];
        if (!identity) return { kind: "return_item_not_ready" };
        const returnId = serializeDatabaseEntityId(identity.returnId);
        const orderId = serializeDatabaseEntityId(identity.orderId);
        const orderItemId = serializeDatabaseEntityId(identity.orderItemId);
        const orders = await this.persistence.sequelize.query<{ id: unknown }>(
            "SELECT id FROM orders WHERE id = ? FOR UPDATE",
            { replacements: [orderId], transaction, type: QueryTypes.SELECT },
        );
        if (!orders[0]) throw new Error("Return order disappeared.");
        const returns = await this.persistence.sequelize.query<ReturnRow>(
            "SELECT order_id AS orderId, receiving_branch_id AS receivingBranchId, status FROM returns WHERE id = ? FOR UPDATE",
            { replacements: [returnId], transaction, type: QueryTypes.SELECT },
        );
        const returned = returns[0];
        if (!returned || serializeDatabaseEntityId(returned.orderId) !== orderId
            || !["inspected", "completed"].includes(returned.status)) return { kind: "return_item_not_ready" };
        const items = await this.persistence.sequelize.query<ItemRow>(
            "SELECT order_id AS orderId, product_variant_id AS variantId, quantity FROM order_items WHERE id = ? FOR UPDATE",
            { replacements: [orderItemId], transaction, type: QueryTypes.SELECT },
        );
        const item = items[0];
        if (!item || item.variantId === null || serializeDatabaseEntityId(item.orderId) !== orderId) {
            throw new Error("Return item belongs to a different order.");
        }
        const soldQuantity = nonnegativeInt(item.quantity);
        if (soldQuantity === null || soldQuantity === 0) throw new Error("Invalid order item quantity.");
        const returnItems = await this.persistence.sequelize.query<ReturnItemRow>(
            `SELECT order_item_id AS orderItemId, requested_quantity AS requested, approved_quantity AS approved,
                    received_quantity AS received, restocked_quantity AS restocked,
                    non_sellable_quantity AS nonSellable
             FROM return_items WHERE id = ? AND return_id = ? FOR UPDATE`,
            { replacements: [returnItemId, returnId], transaction, type: QueryTypes.SELECT },
        );
        const returnItem = returnItems[0];
        const requested = nonnegativeInt(returnItem?.requested);
        const approved = nonnegativeInt(returnItem?.approved);
        const received = nonnegativeInt(returnItem?.received);
        const restocked = nonnegativeInt(returnItem?.restocked);
        const nonSellable = nonnegativeInt(returnItem?.nonSellable);
        if (!returnItem || serializeDatabaseEntityId(returnItem.orderItemId) !== orderItemId
            || requested === null || approved === null || received === null
            || restocked === null || nonSellable === null
            || requested === 0 || approved > requested || received > approved
            || restocked + nonSellable !== received || received > soldQuantity) {
            return { kind: "return_item_not_ready" };
        }
        if (restocked === 0) return { kind: "no_sellable_stock" };
        const handovers = await this.persistence.sequelize.query<{
            variantId: unknown; quantityDelta: unknown; referenceType: string; referenceId: string
        }>(
            `SELECT product_variant_id AS variantId, quantity_delta AS quantityDelta,
                    reference_type AS referenceType, reference_id AS referenceId
             FROM inventory_movements
             WHERE order_item_id = ? AND reason = 'order_handover' ORDER BY id ASC FOR UPDATE`,
            { replacements: [orderItemId], transaction, type: QueryTypes.SELECT },
        );
        if (handovers.length !== 1 || Number(handovers[0]?.quantityDelta) !== -soldQuantity
            || serializeDatabaseEntityId(handovers[0]?.variantId) !== serializeDatabaseEntityId(item.variantId)
            || handovers[0]?.referenceType !== "order" || handovers[0]?.referenceId !== orderId) {
            return { kind: "source_not_handed_over" };
        }
        const movements = await this.persistence.sequelize.query<MovementRow>(
            `SELECT return_item_id AS returnItemId, branch_id AS branchId, product_variant_id AS variantId,
                    quantity_delta AS quantityDelta, balance_after AS balanceAfter, reason,
                    reference_type AS referenceType, reference_id AS referenceId
             FROM inventory_movements WHERE return_item_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [returnItemId], transaction, type: QueryTypes.SELECT },
        );
        const byKey = await this.persistence.sequelize.query<MovementRow>(
            `SELECT return_item_id AS returnItemId, branch_id AS branchId, product_variant_id AS variantId,
                    quantity_delta AS quantityDelta, balance_after AS balanceAfter, reason,
                    reference_type AS referenceType, reference_id AS referenceId
             FROM inventory_movements WHERE idempotency_key = ? FOR UPDATE`,
            { replacements: [operationKey], transaction, type: QueryTypes.SELECT },
        );
        if (byKey[0]) {
            const row = byKey[0];
            const same = row.returnItemId !== null
                && serializeDatabaseEntityId(row.returnItemId) === returnItemId
                && serializeDatabaseEntityId(row.branchId) === serializeDatabaseEntityId(returned.receivingBranchId)
                && serializeDatabaseEntityId(row.variantId) === serializeDatabaseEntityId(item.variantId)
                && Number(row.quantityDelta) === restocked && row.reason === "return_restock"
                && row.referenceType === "return"
                && row.referenceId === returnId;
            const previousBalance = nonnegativeInt(row.balanceAfter);
            return same && previousBalance !== null ? { kind: "replayed", balanceAfter: previousBalance }
                : { kind: "idempotency_conflict" };
        }
        if (movements.length > 0) return { kind: "already_restocked" };
        await this.persistence.sequelize.query(
            `INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at)
             VALUES (?, ?, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id = id`,
            { replacements: [returned.receivingBranchId, item.variantId], transaction },
        );
        const inventories = await this.persistence.sequelize.query<{ id: unknown; stock: unknown }>(
            "SELECT id, stock FROM inventories WHERE branch_id = ? AND product_variant_id = ? FOR UPDATE",
            { replacements: [returned.receivingBranchId, item.variantId], transaction, type: QueryTypes.SELECT },
        );
        const inventory = inventories[0];
        const stock = nonnegativeInt(inventory?.stock);
        if (!inventory || stock === null || stock + restocked > 2_147_483_647) {
            throw new Error("Return destination stock invalid or overflowing.");
        }
        const balanceAfter = stock + restocked;
        await this.persistence.sequelize.query(
            "UPDATE inventories SET stock = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [balanceAfter, inventory.id], transaction },
        );
        await this.persistence.sequelize.query(
            `INSERT INTO inventory_movements (branch_id, product_variant_id, quantity_delta, balance_after,
                return_item_id, reason, reference_type, reference_id, idempotency_key,
                created_by_account_id, occurred_at, created_at)
             VALUES (?, ?, ?, ?, ?, 'return_restock', 'return', ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            { replacements: [returned.receivingBranchId, item.variantId, restocked, balanceAfter,
                returnItemId, returnId, operationKey, actorAccountId], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "restocked", balanceAfter };
    }
}
