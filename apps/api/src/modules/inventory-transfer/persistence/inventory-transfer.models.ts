import {
    DataTypes,
    Model,
    type Optional,
    type Sequelize,
} from "sequelize";
import {
    v2ModelOptions,
    type V2PersistenceModule,
} from "../../../database/v2/persistence.js";

type Timestamps = { createdAt: Date; updatedAt: Date };
type BigIntId = string;
type StockRequestStatus = "pending" | "approved" | "rejected" | "cancelled" | "fulfilled";
type TransferStatus = "pending" | "approved" | "in_transit" | "completed" | "rejected" | "cancelled";
type ReservationStatus = "active" | "consumed" | "released" | "expired";

export type InventoryAttributes = Timestamps & {
    id: BigIntId; branchId: BigIntId; productVariantId: BigIntId; stock: number;
};
export type StockRequestAttributes = Timestamps & {
    id: BigIntId; code: string; fromBranchId: BigIntId; toBranchId: BigIntId;
    status: StockRequestStatus; createdByAccountId: BigIntId; approvedByAccountId: BigIntId | null;
    approvedAt: Date | null;
};
export type StockRequestItemAttributes = Timestamps & {
    id: BigIntId; stockRequestId: BigIntId; productVariantId: BigIntId; quantity: number;
    note: string | null;
};
export type StockRequestHistoryAttributes = {
    id: BigIntId; stockRequestId: BigIntId; action: string; performedByAccountId: BigIntId;
    note: string | null; createdAt: Date;
};
export type TransferReceiptAttributes = Timestamps & {
    id: BigIntId; stockRequestId: BigIntId | null; code: string; fromBranchId: BigIntId;
    toBranchId: BigIntId; status: TransferStatus; createdByAccountId: BigIntId;
    approvedByAccountId: BigIntId | null; approvedAt: Date | null; dispatchedAt: Date | null;
    completedAt: Date | null;
};
export type TransferReceiptItemAttributes = Timestamps & {
    id: BigIntId; transferReceiptId: BigIntId; productVariantId: BigIntId; quantity: number;
    receivedQuantity: number; lostQuantity: number; nonSellableQuantity: number; note: string | null;
};
export type TransferHistoryAttributes = {
    id: BigIntId; transferReceiptId: BigIntId; action: string; performedByAccountId: BigIntId;
    note: string | null; createdAt: Date;
};
export type InventoryReservationAttributes = Timestamps & {
    id: BigIntId; inventoryId: BigIntId; orderItemId: BigIntId | null;
    transferReceiptItemId: BigIntId | null; quantity: number; status: ReservationStatus;
    expiresAt: Date | null; confirmedAt: Date | null; consumedAt: Date | null; releasedAt: Date | null;
    idempotencyKey: string;
};
export type InventoryMovementAttributes = {
    id: BigIntId; branchId: BigIntId; productVariantId: BigIntId; quantityDelta: number;
    balanceAfter: number; orderItemId: BigIntId | null; transferReceiptItemId: BigIntId | null;
    returnItemId: BigIntId | null; reason: string; referenceType: string; referenceId: string;
    idempotencyKey: string; createdByAccountId: BigIntId | null; occurredAt: Date; createdAt: Date;
};

type New<Attributes extends { id: unknown }> = Optional<Attributes, "id">;

const bigintId = () => ({ type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false });
const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
};
const stockRequestStatus = () => DataTypes.ENUM("pending", "approved", "rejected", "cancelled", "fulfilled");
const transferStatus = () => DataTypes.ENUM("pending", "approved", "in_transit", "completed", "rejected", "cancelled");
const reservationStatus = () => DataTypes.ENUM("active", "consumed", "released", "expired");

export const createInventoryTransferPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const Inventory = sequelize.define<Model<InventoryAttributes, New<InventoryAttributes>>>("Inventory", {
        id: bigintId(), branchId: { type: DataTypes.BIGINT, allowNull: false, field: "branch_id" },
        productVariantId: { type: DataTypes.BIGINT, allowNull: false, field: "product_variant_id" },
        stock: { type: DataTypes.INTEGER, allowNull: false }, ...timestamps,
    }, v2ModelOptions("inventories"));
    const StockRequest = sequelize.define<Model<StockRequestAttributes, New<StockRequestAttributes>>>("StockRequest", {
        id: bigintId(), code: { type: DataTypes.STRING(50), allowNull: false },
        fromBranchId: { type: DataTypes.BIGINT, allowNull: false, field: "from_branch_id" },
        toBranchId: { type: DataTypes.BIGINT, allowNull: false, field: "to_branch_id" },
        status: { type: stockRequestStatus(), allowNull: false },
        createdByAccountId: { type: DataTypes.BIGINT, allowNull: false, field: "created_by_account_id" },
        approvedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "approved_by_account_id" },
        approvedAt: { type: DataTypes.DATE, allowNull: true, field: "approved_at" }, ...timestamps,
    }, v2ModelOptions("stock_requests"));
    const StockRequestItem = sequelize.define<Model<StockRequestItemAttributes, New<StockRequestItemAttributes>>>("StockRequestItem", {
        id: bigintId(),
        stockRequestId: { type: DataTypes.BIGINT, allowNull: false, field: "stock_request_id" },
        productVariantId: { type: DataTypes.BIGINT, allowNull: false, field: "product_variant_id" },
        quantity: { type: DataTypes.INTEGER, allowNull: false }, note: { type: DataTypes.STRING(500), allowNull: true },
        ...timestamps,
    }, v2ModelOptions("stock_request_items"));
    const StockRequestHistory = sequelize.define<Model<StockRequestHistoryAttributes, New<StockRequestHistoryAttributes>>>("StockRequestHistory", {
        id: bigintId(),
        stockRequestId: { type: DataTypes.BIGINT, allowNull: false, field: "stock_request_id" },
        action: { type: DataTypes.STRING(100), allowNull: false },
        performedByAccountId: { type: DataTypes.BIGINT, allowNull: false, field: "performed_by_account_id" },
        note: { type: DataTypes.STRING(500), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("stock_request_history"));
    const TransferReceipt = sequelize.define<Model<TransferReceiptAttributes, New<TransferReceiptAttributes>>>("TransferReceipt", {
        id: bigintId(), stockRequestId: { type: DataTypes.BIGINT, allowNull: true, field: "stock_request_id" },
        code: { type: DataTypes.STRING(50), allowNull: false },
        fromBranchId: { type: DataTypes.BIGINT, allowNull: false, field: "from_branch_id" },
        toBranchId: { type: DataTypes.BIGINT, allowNull: false, field: "to_branch_id" },
        status: { type: transferStatus(), allowNull: false },
        createdByAccountId: { type: DataTypes.BIGINT, allowNull: false, field: "created_by_account_id" },
        approvedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "approved_by_account_id" },
        approvedAt: { type: DataTypes.DATE, allowNull: true, field: "approved_at" },
        dispatchedAt: { type: DataTypes.DATE, allowNull: true, field: "dispatched_at" },
        completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" }, ...timestamps,
    }, v2ModelOptions("transfer_receipts"));
    const TransferReceiptItem = sequelize.define<Model<TransferReceiptItemAttributes, New<TransferReceiptItemAttributes>>>("TransferReceiptItem", {
        id: bigintId(),
        transferReceiptId: { type: DataTypes.BIGINT, allowNull: false, field: "transfer_receipt_id" },
        productVariantId: { type: DataTypes.BIGINT, allowNull: false, field: "product_variant_id" },
        quantity: { type: DataTypes.INTEGER, allowNull: false },
        receivedQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "received_quantity" },
        lostQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "lost_quantity" },
        nonSellableQuantity: { type: DataTypes.INTEGER, allowNull: false, field: "non_sellable_quantity" },
        note: { type: DataTypes.STRING(500), allowNull: true }, ...timestamps,
    }, v2ModelOptions("transfer_receipt_items"));
    const TransferHistory = sequelize.define<Model<TransferHistoryAttributes, New<TransferHistoryAttributes>>>("TransferHistory", {
        id: bigintId(),
        transferReceiptId: { type: DataTypes.BIGINT, allowNull: false, field: "transfer_receipt_id" },
        action: { type: DataTypes.STRING(100), allowNull: false },
        performedByAccountId: { type: DataTypes.BIGINT, allowNull: false, field: "performed_by_account_id" },
        note: { type: DataTypes.STRING(500), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("transfer_history"));
    const InventoryReservation = sequelize.define<Model<InventoryReservationAttributes, New<InventoryReservationAttributes>>>("InventoryReservation", {
        id: bigintId(), inventoryId: { type: DataTypes.BIGINT, allowNull: false, field: "inventory_id" },
        orderItemId: { type: DataTypes.BIGINT, allowNull: true, field: "order_item_id" },
        transferReceiptItemId: { type: DataTypes.BIGINT, allowNull: true, field: "transfer_receipt_item_id" },
        quantity: { type: DataTypes.INTEGER, allowNull: false },
        status: { type: reservationStatus(), allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: true, field: "expires_at" },
        confirmedAt: { type: DataTypes.DATE, allowNull: true, field: "confirmed_at" },
        consumedAt: { type: DataTypes.DATE, allowNull: true, field: "consumed_at" },
        releasedAt: { type: DataTypes.DATE, allowNull: true, field: "released_at" },
        idempotencyKey: { type: DataTypes.STRING(191), allowNull: false, field: "idempotency_key" }, ...timestamps,
    }, v2ModelOptions("inventory_reservations"));
    const InventoryMovement = sequelize.define<Model<InventoryMovementAttributes, New<InventoryMovementAttributes>>>("InventoryMovement", {
        id: bigintId(), branchId: { type: DataTypes.BIGINT, allowNull: false, field: "branch_id" },
        productVariantId: { type: DataTypes.BIGINT, allowNull: false, field: "product_variant_id" },
        quantityDelta: { type: DataTypes.INTEGER, allowNull: false, field: "quantity_delta" },
        balanceAfter: { type: DataTypes.INTEGER, allowNull: false, field: "balance_after" },
        orderItemId: { type: DataTypes.BIGINT, allowNull: true, field: "order_item_id" },
        transferReceiptItemId: { type: DataTypes.BIGINT, allowNull: true, field: "transfer_receipt_item_id" },
        returnItemId: { type: DataTypes.BIGINT, allowNull: true, field: "return_item_id" },
        reason: { type: DataTypes.STRING(100), allowNull: false },
        referenceType: { type: DataTypes.STRING(100), allowNull: false, field: "reference_type" },
        referenceId: { type: DataTypes.STRING(100), allowNull: false, field: "reference_id" },
        idempotencyKey: { type: DataTypes.STRING(191), allowNull: false, field: "idempotency_key" },
        createdByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "created_by_account_id" },
        occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("inventory_movements"));

    return {
        name: "inventory-transfer",
        models: [
            { name: "Inventory", model: Inventory }, { name: "StockRequest", model: StockRequest },
            { name: "StockRequestItem", model: StockRequestItem }, { name: "StockRequestHistory", model: StockRequestHistory },
            { name: "TransferReceipt", model: TransferReceipt }, { name: "TransferReceiptItem", model: TransferReceiptItem },
            { name: "TransferHistory", model: TransferHistory }, { name: "InventoryReservation", model: InventoryReservation },
            { name: "InventoryMovement", model: InventoryMovement },
        ],
        associate: () => {
            StockRequest.hasMany(StockRequestItem, { foreignKey: "stockRequestId", as: "items" });
            StockRequestItem.belongsTo(StockRequest, { foreignKey: "stockRequestId", as: "stockRequest" });
            StockRequest.hasMany(StockRequestHistory, { foreignKey: "stockRequestId", as: "history" });
            StockRequestHistory.belongsTo(StockRequest, { foreignKey: "stockRequestId", as: "stockRequest" });
            StockRequest.hasMany(TransferReceipt, { foreignKey: "stockRequestId", as: "transferReceipts" });
            TransferReceipt.belongsTo(StockRequest, { foreignKey: "stockRequestId", as: "stockRequest" });
            TransferReceipt.hasMany(TransferReceiptItem, { foreignKey: "transferReceiptId", as: "items" });
            TransferReceiptItem.belongsTo(TransferReceipt, { foreignKey: "transferReceiptId", as: "transferReceipt" });
            TransferReceipt.hasMany(TransferHistory, { foreignKey: "transferReceiptId", as: "history" });
            TransferHistory.belongsTo(TransferReceipt, { foreignKey: "transferReceiptId", as: "transferReceipt" });
            Inventory.hasMany(InventoryReservation, { foreignKey: "inventoryId", as: "reservations" });
            InventoryReservation.belongsTo(Inventory, { foreignKey: "inventoryId", as: "inventory" });
            TransferReceiptItem.hasMany(InventoryReservation, { foreignKey: "transferReceiptItemId", as: "reservations" });
            InventoryReservation.belongsTo(TransferReceiptItem, { foreignKey: "transferReceiptItemId", as: "transferReceiptItem" });
            TransferReceiptItem.hasMany(InventoryMovement, { foreignKey: "transferReceiptItemId", as: "inventoryMovements" });
            InventoryMovement.belongsTo(TransferReceiptItem, { foreignKey: "transferReceiptItemId", as: "transferReceiptItem" });
        },
    };
};
