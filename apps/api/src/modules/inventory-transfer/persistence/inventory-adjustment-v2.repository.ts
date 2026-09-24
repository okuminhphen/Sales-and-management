import { createHash } from "node:crypto";
import { QueryTypes, type Transaction } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeDatabaseEntityId } from "../../../shared/contracts/database-scalars.js";
import type { InventoryAdjustmentInput, InventoryAdjustmentOutcome, InventoryAdjustmentV2Repository } from "../application/inventory-adjustment-v2.service.js";

type InventoryRow = { id: unknown; stock: unknown };
type MovementRow = {
    id: unknown; branchId: unknown; variantId: unknown; quantityDelta: unknown;
    balanceAfter: unknown; reason: string; actorAccountId: unknown; referenceType: string;
};

const quantity = (value: unknown): number => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed)) throw new Error("Invalid inventory quantity in database.");
    return parsed;
};

/** Only manual corrections use this adapter; all other stock mutations need typed source FKs. */
export class SequelizeInventoryAdjustmentV2Repository implements InventoryAdjustmentV2Repository {
    constructor(private readonly persistence: V2Persistence) {}

    async adjust(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentOutcome> {
        try {
            return await this.persistence.inTransaction((transaction) => this.adjustLocked(input, transaction));
        } catch (error) {
            const code = (error as { parent?: { code?: string } })?.parent?.code;
            if (code === "ER_DUP_ENTRY") return { kind: "idempotency_conflict" };
            throw error;
        }
    }

    private async adjustLocked(input: InventoryAdjustmentInput, transaction: Transaction): Promise<InventoryAdjustmentOutcome> {
        const inventorySql = "SELECT id, stock FROM inventories WHERE branch_id = ? AND product_variant_id = ? FOR UPDATE";
        const replacements = [input.branchId, input.variantId];
        let inventories = await this.persistence.sequelize.query<InventoryRow>(inventorySql,
            { replacements, transaction, type: QueryTypes.SELECT });
        if (inventories.length === 0 && input.quantityDelta < 0) return { kind: "insufficient_stock" };
        if (inventories.length === 0) {
            await this.persistence.sequelize.query(
                "INSERT INTO inventories (branch_id, product_variant_id, stock, created_at, updated_at) VALUES (?, ?, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id = id",
                { replacements, transaction },
            );
            inventories = await this.persistence.sequelize.query<InventoryRow>(inventorySql,
                { replacements, transaction, type: QueryTypes.SELECT });
        }
        const inventory = inventories[0];
        if (!inventory) throw new Error("Inventory row disappeared after initialization.");
        const inventoryId = serializeDatabaseEntityId(inventory.id);
        const stock = quantity(inventory.stock);
        if (stock < 0 || stock > 2_147_483_647) throw new Error("Invalid stock in database.");
        const activeHolds = await this.persistence.sequelize.query<{ quantity: unknown }>(
            "SELECT quantity FROM inventory_reservations WHERE inventory_id = ? AND status = 'active' ORDER BY id ASC FOR UPDATE",
            { replacements: [inventoryId], transaction, type: QueryTypes.SELECT },
        );
        const reserved = activeHolds.reduce((sum, hold) => {
            const held = quantity(hold.quantity);
            if (held <= 0 || !Number.isSafeInteger(sum + held)) throw new Error("Invalid active hold quantity.");
            return sum + held;
        }, 0);
        if (reserved > stock) throw new Error("Active holds exceed physical stock.");

        const previous = await this.persistence.sequelize.query<MovementRow>(
            "SELECT id, branch_id AS branchId, product_variant_id AS variantId, quantity_delta AS quantityDelta, balance_after AS balanceAfter, reason, created_by_account_id AS actorAccountId, reference_type AS referenceType FROM inventory_movements WHERE idempotency_key = ? FOR UPDATE",
            { replacements: [input.idempotencyKey], transaction, type: QueryTypes.SELECT },
        );
        if (previous[0]) {
            const movement = previous[0];
            const same = serializeDatabaseEntityId(movement.branchId) === input.branchId
                && serializeDatabaseEntityId(movement.variantId) === input.variantId
                && quantity(movement.quantityDelta) === input.quantityDelta
                && movement.actorAccountId !== null && serializeDatabaseEntityId(movement.actorAccountId) === input.actorAccountId
                && movement.reason === input.reason && movement.referenceType === "manual_adjustment";
            return same
                ? { kind: "replayed", movementId: serializeDatabaseEntityId(movement.id), balanceAfter: quantity(movement.balanceAfter) }
                : { kind: "idempotency_conflict" };
        }

        const balanceAfter = stock + input.quantityDelta;
        if (balanceAfter > 2_147_483_647) throw new Error("Stock would overflow INTEGER.");
        if (balanceAfter < reserved) return { kind: "insufficient_stock" };
        await this.persistence.sequelize.query(
            "UPDATE inventories SET stock = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
            { replacements: [balanceAfter, inventoryId], transaction },
        );
        const referenceId = createHash("sha256").update(input.idempotencyKey).digest("hex");
        const [id] = await this.persistence.sequelize.query(
            "INSERT INTO inventory_movements (branch_id, product_variant_id, quantity_delta, balance_after, reason, reference_type, reference_id, idempotency_key, created_by_account_id, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, 'manual_adjustment', ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))",
            { replacements: [input.branchId, input.variantId, input.quantityDelta, balanceAfter,
                input.reason, referenceId, input.idempotencyKey, input.actorAccountId], transaction, type: QueryTypes.INSERT },
        );
        return { kind: "adjusted", movementId: serializeDatabaseEntityId(id), balanceAfter };
    }
}
