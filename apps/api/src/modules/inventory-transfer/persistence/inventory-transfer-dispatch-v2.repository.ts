import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { retryV2Transaction } from "../../../database/v2/transaction-retry.js";
import { serializeDatabaseEntityId, type EntityId } from "../../../shared/contracts/database-scalars.js";

export type TransferDispatchOutcome =
    | { kind: "dispatched" | "replayed"; balanceAfter: number }
    | { kind: "transfer_item_not_dispatchable" | "hold_not_confirmed" | "reservation_finalized" | "idempotency_conflict" };

type IdentityRow = { receiptId: unknown; requestId: unknown };
type ReceiptRow = { requestId: unknown; fromBranchId: unknown; toBranchId: unknown; status: string };
type RequestRow = { fromBranchId: unknown; toBranchId: unknown; status: string };
type ItemRow = { variantId: unknown; quantity: unknown };
type InventoryRow = { id: unknown; stock: unknown };
type HoldRow = { id: unknown; transferItemId: unknown; inventoryId: unknown; quantity: unknown;
    status: string; confirmedAt: Date | null; expiresAt: Date | null };
type MovementRow = { transferItemId: unknown; branchId: unknown; variantId: unknown;
    quantityDelta: unknown; balanceAfter: unknown; referenceType: string; referenceId: string };

const quantity = (value: unknown, minimum: number): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
};

/** Dispatch primitive; T31 owns receipt state/authorization in the same transaction. */
export class SequelizeInventoryTransferDispatchV2Repository {
    constructor(private readonly persistence: V2Persistence, private readonly transaction?: Transaction) {}

    async dispatchTransferItem(transferItemId: EntityId, operationKey: string,
        actorAccountId: EntityId): Promise<TransferDispatchOutcome> {
        if (!/^[A-Za-z0-9._:-]{1,191}$/.test(operationKey)) throw new TypeError("Invalid inventory operation key.");
        try {
            const work = (transaction: Transaction) => this.dispatchLocked(transferItemId, operationKey, actorAccountId, transaction);
            return this.transaction ? await work(this.transaction)
                : await retryV2Transaction(() => this.persistence.inTransaction(work));
        } catch (error) {
            // A caller-owned transaction must fail so earlier stock/hold writes cannot be committed without a movement.
            if (!this.transaction && (error as { parent?: { code?: string } })?.parent?.code === "ER_DUP_ENTRY") {
                return { kind: "idempotency_conflict" };
            }
            throw error;
        }
    }

    private async dispatchLocked(transferItemId: EntityId, operationKey: string,
        actorAccountId: EntityId, transaction: Transaction): Promise<TransferDispatchOutcome> {
        const identities = await this.persistence.sequelize.query<IdentityRow>(
            `SELECT ti.transfer_receipt_id AS receiptId, tr.stock_request_id AS requestId
             FROM transfer_receipt_items ti JOIN transfer_receipts tr ON tr.id = ti.transfer_receipt_id
             WHERE ti.id = ?`,
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        const identity = identities[0];
        if (!identity) return { kind: "transfer_item_not_dispatchable" };
        const receiptId = serializeDatabaseEntityId(identity.receiptId);
        const requestId = identity.requestId === null ? null : serializeDatabaseEntityId(identity.requestId);
        const request = requestId === null ? null : (await this.persistence.sequelize.query<RequestRow>(
            "SELECT from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status FROM stock_requests WHERE id = ? FOR UPDATE",
            { replacements: [requestId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const receipt = (await this.persistence.sequelize.query<ReceiptRow>(
            "SELECT stock_request_id AS requestId, from_branch_id AS fromBranchId, to_branch_id AS toBranchId, status FROM transfer_receipts WHERE id = ? FOR UPDATE",
            { replacements: [receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!receipt || !["in_transit", "completed"].includes(receipt.status)
            || (receipt.requestId === null ? null : serializeDatabaseEntityId(receipt.requestId)) !== requestId
            || (requestId !== null && (!request
                || !(receipt.status === "completed"
                    ? ["approved", "fulfilled"].includes(request.status) : request.status === "approved")
                || serializeDatabaseEntityId(request.fromBranchId) !== serializeDatabaseEntityId(receipt.toBranchId)
                || serializeDatabaseEntityId(request.toBranchId) !== serializeDatabaseEntityId(receipt.fromBranchId)))) {
            return { kind: "transfer_item_not_dispatchable" };
        }
        const item = (await this.persistence.sequelize.query<ItemRow>(
            "SELECT product_variant_id AS variantId, quantity FROM transfer_receipt_items WHERE id = ? AND transfer_receipt_id = ? FOR UPDATE",
            { replacements: [transferItemId, receiptId], transaction, type: QueryTypes.SELECT },
        ))[0];
        const itemQuantity = quantity(item?.quantity, 1);
        if (!item || item.variantId === null || itemQuantity === null) throw new Error("Invalid transfer item in database.");
        const inventory = (await this.persistence.sequelize.query<InventoryRow>(
            "SELECT id, stock FROM inventories WHERE branch_id = ? AND product_variant_id = ? FOR UPDATE",
            { replacements: [receipt.fromBranchId, item.variantId], transaction, type: QueryTypes.SELECT },
        ))[0];
        if (!inventory) return { kind: "transfer_item_not_dispatchable" };
        const inventoryId = serializeDatabaseEntityId(inventory.id);
        const holds = await this.persistence.sequelize.query<HoldRow>(
            `SELECT id, transfer_receipt_item_id AS transferItemId, inventory_id AS inventoryId,
                    quantity, status, confirmed_at AS confirmedAt, expires_at AS expiresAt
             FROM inventory_reservations WHERE inventory_id = ? AND status = 'active' ORDER BY id ASC FOR UPDATE`,
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const itemHolds = await this.persistence.sequelize.query<HoldRow>(
            `SELECT id, transfer_receipt_item_id AS transferItemId, inventory_id AS inventoryId,
                    quantity, status, confirmed_at AS confirmedAt, expires_at AS expiresAt
             FROM inventory_reservations WHERE transfer_receipt_item_id = ? ORDER BY id ASC FOR UPDATE`,
            { replacements: [transferItemId], transaction, type: QueryTypes.SELECT },
        );
        const hold = itemHolds.length === 1 ? itemHolds[0] : undefined;
        if (hold && (hold.transferItemId === null || serializeDatabaseEntityId(hold.transferItemId) !== transferItemId
            || serializeDatabaseEntityId(hold.inventoryId) !== inventoryId
            || quantity(hold.quantity, 1) !== itemQuantity)) throw new Error("Transfer hold source mismatch.");
        const movements = await this.persistence.sequelize.query<MovementRow>(
            `SELECT transfer_receipt_item_id AS transferItemId, branch_id AS branchId,
                    product_variant_id AS variantId, quantity_delta AS quantityDelta,
                    balance_after AS balanceAfter, reference_type AS referenceType, reference_id AS referenceId
             FROM inventory_movements WHERE idempotency_key = ? FOR UPDATE`,
            { replacements: [operationKey], transaction, type: QueryTypes.SELECT },
        );
        if (movements[0]) {
            const movement = movements[0];
            const same = movement.transferItemId !== null
                && serializeDatabaseEntityId(movement.transferItemId) === transferItemId
                && serializeDatabaseEntityId(movement.branchId) === serializeDatabaseEntityId(receipt.fromBranchId)
                && serializeDatabaseEntityId(movement.variantId) === serializeDatabaseEntityId(item.variantId)
                && Number(movement.quantityDelta) === -itemQuantity
                && movement.referenceType === "transfer_receipt" && movement.referenceId === receiptId;
            const previousBalance = quantity(movement.balanceAfter, 0);
            if (!same || hold?.status !== "consumed" || previousBalance === null) return { kind: "idempotency_conflict" };
            return { kind: "replayed", balanceAfter: previousBalance };
        }
        if (!hold) return { kind: "hold_not_confirmed" };
        if (receipt.status !== "in_transit") return { kind: "transfer_item_not_dispatchable" };
        if (hold.status !== "active") return { kind: "reservation_finalized" };
        if (hold.confirmedAt === null || hold.expiresAt !== null) return { kind: "hold_not_confirmed" };
        const stock = quantity(inventory.stock, 0);
        if (stock === null) throw new Error("Invalid source stock in database.");
        const reserved = holds.reduce((sum, active) => {
            const held = quantity(active.quantity, 1);
            if (held === null || !Number.isSafeInteger(sum + held)) throw new Error("Invalid active hold quantity.");
            return sum + held;
        }, 0);
        if (reserved > stock || itemQuantity > stock || stock - itemQuantity < reserved - itemQuantity) {
            throw new Error("Inventory invariant violated at transfer dispatch.");
        }
        const balanceAfter = stock - itemQuantity;
        await this.persistence.sequelize.query(
            "UPDATE inventories SET stock = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [balanceAfter, inventoryId], transaction },
        );
        await this.persistence.sequelize.query(
            "UPDATE inventory_reservations SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
            { replacements: [hold.id], transaction },
        );
        await this.persistence.sequelize.query(
            `INSERT INTO inventory_movements (branch_id, product_variant_id, quantity_delta, balance_after,
                transfer_receipt_item_id, reason, reference_type, reference_id, idempotency_key,
                created_by_account_id, occurred_at, created_at)
             VALUES (?, ?, ?, ?, ?, 'transfer_dispatch', 'transfer_receipt', ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            { replacements: [receipt.fromBranchId, item.variantId, -itemQuantity, balanceAfter,
                transferItemId, receiptId, operationKey, actorAccountId], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "dispatched", balanceAfter };
    }
}
